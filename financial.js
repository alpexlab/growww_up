const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Scrapes all tables from a website and saves each to a separate CSV file
 * @param {string} url - The URL of the website to scrape
 * @param {string} outputDir - Directory to save CSV files (default: 'table_data')
 */
async function scrapeAllTables(url, outputDir = 'table_data') {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Launch the browser
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Set viewport to large size to ensure all content loads
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Navigate to the URL
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 60000 // 60 seconds timeout
    });
    
    // Get all tables on the page
    const tableCount = await page.evaluate(() => {
      return document.querySelectorAll('table').length;
    });
    
    console.log(`Found ${tableCount} tables on the page.`);
    
    // If no tables are found, try looking for table-like structures
    if (tableCount === 0) {
      console.log('No standard tables found. Looking for table-like structures...');
      return await scrapeTableLikeStructures(page, outputDir);
    }
    
    // Process each table
    for (let i = 0; i < 1; i++) {
      console.log(`Processing table ${i + 1}/${tableCount}...`);
      
      // Extract data from the current table
      const tableData = await page.evaluate((tableIndex) => {
        const table = document.querySelectorAll('table')[tableIndex];
        const rows = table.querySelectorAll('tr');
        const data = [];
        
        // Extract table header if available
        const headerRow = table.querySelector('thead tr');
        let headers = [];
        
        if (headerRow) {
          headers = Array.from(headerRow.querySelectorAll('th, td')).map(cell => cell.textContent.trim());
        } else if (rows.length > 0) {
          // Use first row as header if no thead
          headers = Array.from(rows[0].querySelectorAll('th, td')).map(cell => cell.textContent.trim());
        }
        
        // Process rows (skip first if it was used as header and no thead found)
        const startRow = (headerRow || headers.length === 0) ? 0 : 1;
        
        for (let j = startRow; j < rows.length; j++) {
          const row = rows[j];
          const cells = row.querySelectorAll('td, th');
          const rowData = Array.from(cells).map(cell => cell.textContent.trim());
          
          if (rowData.some(cell => cell.length > 0)) {  // Skip empty rows
            data.push(rowData);
          }
        }
        
        return { headers, data };
      }, i);
      
      // Generate filename for this table
      const fileName = `table_${i + 1}.csv`;
      const filePath = path.join(outputDir, fileName);
      
      // Convert data to CSV format
      let csvContent = '';
      
      // Add header row if available
      if (tableData.headers.length > 0) {
        csvContent += tableData.headers.map(header => `"${header}"`).join(',') + '\n';
      }
      
      // Add data rows
      tableData.data.forEach(row => {
        csvContent += row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',') + '\n';
      });
      
      // Write to file
      fs.writeFileSync(filePath, csvContent);
      console.log(`Table ${i + 1} data saved to ${filePath}`);
    }
    
    console.log('All tables processed successfully!');
  } catch (error) {
    console.error('Error during scraping:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Scrapes table-like structures (divs formatted as tables) from a page
 * @param {Page} page - Puppeteer page object
 * @param {string} outputDir - Directory to save CSV files
 */
async function scrapeTableLikeStructures(page, outputDir) {
  console.log('Looking for div-based tables and table-like structures...');
  
  // First, try to extract from tbody elements (common in modern websites)
  const tbodyCount = await page.evaluate(() => {
    return document.querySelectorAll('tbody').length;
  });
  
  if (tbodyCount > 0) {
    console.log(`Found ${tbodyCount} tbody elements. Extracting data...`);
    
    // Process each tbody element
    for (let i = 0; i < tbodyCount; i++) {
      const tableData = await page.evaluate((tbodyIndex) => {
        const tbody = document.querySelectorAll('tbody')[tbodyIndex];
        const rows = tbody.querySelectorAll('tr');
        const data = [];
        
        for (let j = 0; j < rows.length; j++) {
          const row = rows[j];
          const cells = row.querySelectorAll('td');
          
          // Create row with key-value pair structure if there are two cells per row
          if (cells.length === 2) {
            const key = cells[0].textContent.trim();
            const value = cells[1].textContent.trim();
            data.push([key, value]);
          } else {
            // Otherwise collect all cells
            const rowData = Array.from(cells).map(cell => cell.textContent.trim());
            data.push(rowData);
          }
        }
        
        // For key-value style tables, use default headers
        const headers = (data.length > 0 && data[0].length === 2) ? ['Metric', 'Value'] : [];
        
        return { headers, data };
      }, i);
      
      // Generate filename for this table
      const fileName = `tbody_table_${i + 1}.csv`;
      const filePath = path.join(outputDir, fileName);
      
      // Convert to CSV and save
      let csvContent = '';
      
      // Add header row if available
      if (tableData.headers.length > 0) {
        csvContent += tableData.headers.map(header => `"${header}"`).join(',') + '\n';
      }
      
      // Add data rows
      tableData.data.forEach(row => {
        if (row.length > 0) {
          csvContent += row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',') + '\n';
        }
      });
      
      // Write to file
      fs.writeFileSync(filePath, csvContent);
      console.log(`Table-like structure ${i + 1} data saved to ${filePath}`);
    }
    
    return true;
  }
  
  // Look for div-based tables (grid layouts)
  const divTables = await page.evaluate(() => {
    // Find potential div-based tables
    // This is a heuristic approach - looking for parent divs with multiple child divs in a consistent pattern
    const candidates = [];
    
    // Look for div elements that might be acting as tables
    const divs = document.querySelectorAll('div');
    
    for (const div of divs) {
      // Check if this div has multiple child divs that could be rows
      const childDivs = div.children;
      
      if (childDivs.length > 2) {
        // Check if children have similar structure (potential rows)
        const firstChildClass = childDivs[0].className;
        const similarChildren = Array.from(childDivs).filter(child => 
          child.className === firstChildClass).length;
        
        // If most children have same class, might be a table
        if (similarChildren > childDivs.length * 0.7) {
          candidates.push(div);
        }
      }
    }
    
    return candidates.length;
  });
  
  console.log(`Found ${divTables} potential div-based tables.`);
  
  if (divTables === 0) {
    console.log('No table-like structures found.');
    return false;
  }
  
  // Process each div-based table
  for (let i = 0; i < divTables; i++) {
    // This is complex and highly depends on the specific structure
    // We'll use a generic approach but it might need customization
    const divTableData = await page.evaluate((tableIndex) => {
      // Find potential div-based tables again
      const candidates = [];
      const divs = document.querySelectorAll('div');
      
      for (const div of divs) {
        const childDivs = div.children;
        
        if (childDivs.length > 2) {
          const firstChildClass = childDivs[0].className;
          const similarChildren = Array.from(childDivs).filter(child => 
            child.className === firstChildClass).length;
          
          if (similarChildren > childDivs.length * 0.7) {
            candidates.push(div);
          }
        }
      }
      
      const divTable = candidates[tableIndex];
      const rows = Array.from(divTable.children);
      const data = [];
      
      // Process each "row"
      for (const row of rows) {
        const cells = Array.from(row.children);
        const rowData = cells.map(cell => cell.textContent.trim());
        
        if (rowData.some(text => text.length > 0)) {
          data.push(rowData);
        }
      }
      
      return { headers: [], data };
    }, i);
    
    // Generate filename for this div-table
    const fileName = `div_table_${i + 1}.csv`;
    const filePath = path.join(outputDir, fileName);
    
    // Convert to CSV and save
    let csvContent = '';
    
    // Add data rows
    divTableData.data.forEach(row => {
      csvContent += row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',') + '\n';
    });
    
    // Write to file
    fs.writeFileSync(filePath, csvContent);
    console.log(`Div-based table ${i + 1} data saved to ${filePath}`);
  }
  
  return true;
}

/**
 * Processes a local HTML file to extract all tables
 * @param {string} htmlFilePath - Path to the HTML file
 * @param {string} outputDir - Directory to save CSV files (default: 'table_data')
 */
async function processLocalHtmlFile(htmlFilePath, outputDir = 'table_data') {
  // Construct file URL
  const fileUrl = `file://${path.resolve(htmlFilePath)}`;
  return scrapeAllTables(fileUrl, outputDir);
}

/**
 * Processes HTML string content to extract all tables
 * @param {string} htmlContent - HTML content as a string
 * @param {string} outputDir - Directory to save CSV files (default: 'table_data')
 */
async function processHtmlContent(htmlContent, outputDir = 'table_data') {
  // Create a temporary HTML file
  const tempFilePath = path.join(process.cwd(), 'temp_scraper_file.html');
  
  // Wrap in a proper HTML structure if needed
  let fullHtml = htmlContent;
  if (!htmlContent.includes('<html')) {
    fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Table Data</title>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;
  }
  
  // Write to temporary file
  fs.writeFileSync(tempFilePath, fullHtml);
  
  try {
    // Process the file
    return await processLocalHtmlFile(tempFilePath, outputDir);
  } finally {
    // Clean up temporary file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

/**
 * Process the HTML content provided in the example
 */
async function processProvidedHTML() {
  // The HTML content from the prompt
  const htmlContent = `<tbody class=""><tr class="col l6 ft785RightSpace" style="border-bottom: medium;"><td colspan="1" rowspan="1" style="padding-left: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Head left-align contentSecondary bodyBase" width="100%">Market Cap</td><td colspan="1" rowspan="1" style="padding-right: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Value right-align contentPrimary bodyLargeHeavy" width="100%">₹13,13,764Cr</td></tr><tr class="col l6 ft785LeftSpace" style="border-bottom: medium;"><td colspan="1" rowspan="1" style="padding-left: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Head left-align contentSecondary bodyBase" width="100%">ROE</td><td colspan="1" rowspan="1" style="padding-right: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Value right-align contentPrimary bodyLargeHeavy" width="100%">46.74%</td></tr><tr class="col l6 ft785RightSpace" style="border-bottom: medium;"><td colspan="1" rowspan="1" style="padding-left: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Head left-align contentSecondary bodyBase" width="100%">P/E Ratio(TTM)</td><td colspan="1" rowspan="1" style="padding-right: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Value right-align contentPrimary bodyLargeHeavy" width="100%">26.94</td></tr><tr class="col l6 ft785LeftSpace" style="border-bottom: medium;"><td colspan="1" rowspan="1" style="padding-left: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Head left-align contentSecondary bodyBase" width="100%">EPS(TTM)</td><td colspan="1" rowspan="1" style="padding-right: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Value right-align contentPrimary bodyLargeHeavy" width="100%">134.78</td></tr><tr class="col l6 ft785RightSpace" style="border-bottom: medium;"><td colspan="1" rowspan="1" style="padding-left: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Head left-align contentSecondary bodyBase" width="100%">P/B Ratio</td><td colspan="1" rowspan="1" style="padding-right: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Value right-align contentPrimary bodyLargeHeavy" width="100%">12.97</td></tr><tr class="col l6 ft785LeftSpace" style="border-bottom: medium;"><td colspan="1" rowspan="1" style="padding-left: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Head left-align contentSecondary bodyBase" width="100%">Dividend Yield</td><td colspan="1" rowspan="1" style="padding-right: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Value right-align contentPrimary bodyLargeHeavy" width="100%">2.01%</td></tr><tr class="col l6 ft785RightSpace" style="border-bottom: medium;"><td colspan="1" rowspan="1" style="padding-left: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Head left-align contentSecondary bodyBase" width="100%">Industry P/E</td><td colspan="1" rowspan="1" style="padding-right: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Value right-align contentPrimary bodyLargeHeavy" width="100%">29.38</td></tr><tr class="col l6 ft785LeftSpace" style="border-bottom: medium;"><td colspan="1" rowspan="1" style="padding-left: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Head left-align contentSecondary bodyBase" width="100%">Book Value</td><td colspan="1" rowspan="1" style="padding-right: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Value right-align contentPrimary bodyLargeHeavy" width="100%">279.87</td></tr><tr class="col l6 ft785RightSpace" style="border-bottom: medium;"><td colspan="1" rowspan="1" style="padding-left: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Head left-align contentSecondary bodyBase" width="100%">Debt to Equity</td><td colspan="1" rowspan="1" style="padding-right: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Value right-align contentPrimary bodyLargeHeavy" width="100%">0.09</td></tr><tr class="col l6 ft785LeftSpace" style="border-bottom: medium;"><td colspan="1" rowspan="1" style="padding-left: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Head left-align contentSecondary bodyBase" width="100%">Face Value</td><td colspan="1" rowspan="1" style="padding-right: 0px; padding-top: 10px; padding-bottom: 10px;" class="ft785Value right-align contentPrimary bodyLargeHeavy" width="100%">1</td></tr></tbody>`;
  
  // Process the HTML content
  return processHtmlContent(`<table>${htmlContent}</table>`, 'financial_data');
}

// Export functions
module.exports = {
  scrapeAllTables,
  processLocalHtmlFile,
  processHtmlContent,
  processProvidedHTML
};

// Uncomment one of these lines to run the script directly:
scrapeAllTables('https://groww.in/stocks/tata-consultancy-services-ltd', 'output_data');
// processLocalHtmlFile('path/to/local/file.html', 'output_data');
// processProvidedHTML().catch(console.error);