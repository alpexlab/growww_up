const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * List of Nifty 50 stocks (as of February 2025)
 * This list includes the correct stock names based on the provided data
 */
const NIFTY_50_STOCKS = [
  'ADANIPORTS', 'ASIANPAINT', 'AXISBANK', 'BAJAJ-AUTO', 'BAJFINANCE', 
  'BAJAJFINSV', 'BPCL', 'BHARTIARTL', 'BRITANNIA', 'CIPLA', 
  'COALINDIA', 'DRREDDY', 'EICHERMOT', 'GRASIM', 
  'HCLTECH', 'HDFCBANK', 'HDFCLIFE', 'HEROMOTOCO', 'HINDALCO', 
  'HINDUNILVR', 'ICICIBANK', 'ITC', 'INDUSINDBK', 'INFY', 
  'JSWSTEEL', 'KOTAKBANK', 'LT', 'M&M', 'MARUTI', 
  'NTPC', 'NESTLEIND', 'ONGC', 'POWERGRID', 'RELIANCE', 
  'SBILIFE', 'SBIN', 'SUNPHARMA', 'TCS', 'TATACONSUM', 
  'TATAMOTORS', 'TATASTEEL', 'TECHM', 'TITAN', 'UPL', 
  'ULTRACEMCO', 'WIPRO'
];

// Additional stocks from the provided data
const ADDITIONAL_STOCKS = [
  'ADANIENT', 'APOLLOHOSP', 'BEL', 'SHRIRAMFIN', 'TRENT'
];

// Complete list of stocks to scrape
const ALL_STOCKS = [...NIFTY_50_STOCKS, ...ADDITIONAL_STOCKS];

/**
 * Search for each stock in the stock list and scrape data
 * @param {string} baseUrl - Base URL of the website to scrape (e.g., 'https://groww.in')
 * @param {string} outputDir - Directory to save CSV files and PDFs
 */
async function scrapeStocksData(baseUrl, outputDir = 'stock_data') {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Create PDF directory
  const pdfDir = path.join(outputDir, 'pdfs');
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }
  
  // Create a master CSV file to store comprehensive data
  const masterCsvPath = path.join(outputDir, 'stocks_master.csv');
  
  // Define only the specific metrics we want to capture
  const allMetrics = [
    'URL', 'Market Cap', 'P/E Ratio', 'ROE', 'EPS', 'Dividend Yield',
    'Book Value', 'ROCE', 'Debt to Equity', 'Face Value', 'Industry P/E',
    'P/B Ratio'
  ];
  
  // Create CSV header with all metrics
  const csvHeader = ['Stock', ...allMetrics].join(',') + '\n';
  fs.writeFileSync(masterCsvPath, csvHeader);
  
  // Launch the browser
  const browser = await puppeteer.launch({
    headless: false, // Set to true for production
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  try {
    // Create a new page
    const page = await browser.newPage();
    
    // Set a reasonable timeout
    page.setDefaultTimeout(30000);
    
    // Navigate to the base URL
    console.log(`Navigating to ${baseUrl}...`);
    await page.goto(baseUrl, { waitUntil: 'networkidle2' });
    
    // Accept any cookies/disclaimers if needed
    try {
      const acceptButtonSelectors = [
        'button[aria-label="Accept"]', 
        'button:contains("Accept")', 
        '.cookie-consent-accept',
        'button:contains("I agree")',
        'button.accept-cookies'
      ];
      
      for (const selector of acceptButtonSelectors) {
        const acceptButton = await page.$(selector);
        if (acceptButton) {
          await acceptButton.click();
          await new Promise(resolve => setTimeout(resolve, 1000));
          break;
        }
      }
    } catch (error) {
      console.log('No cookie consent needed or unable to handle it:', error.message);
    }
    
    // Save the homepage as PDF
    await savePdf(page, path.join(pdfDir, 'homepage.pdf'));
    
    // Process each stock in the list
    for (let i = 0; i < ALL_STOCKS.length; i++) {
      await page.goto(baseUrl, { waitUntil: 'networkidle2' });

      const stock = ALL_STOCKS[i];
      console.log(`\nProcessing stock ${i + 1}/${ALL_STOCKS.length}: ${stock}`);
      
      try {
        // Find and click the search icon
        await findAndClickSearchIcon(page);
        
        // Wait for the search input to be available
        await waitForSearchInput(page);
        
        // Clear any existing input and type the stock name
        await typeInSearchInput(page, stock);
        
        // Wait for search results and click on the first relevant result
        await waitForAndClickSearchResult(page, stock);
        
        // Wait for the stock page to load
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Get the current page URL
        const stockUrl = page.url();
        console.log(`Stock URL: ${stockUrl}`);
        
        // Save the stock page as PDF
        await savePdf(page, path.join(pdfDir, `${stock}.pdf`));
        
        // Scrape the data tables from the stock page
        const stockData = await scrapeStockData(page);
        
        // Add the URL to the stock data
        stockData['URLData'] = { 'URL': stockUrl };
        
        // Save the data to individual stock file
        const stockCsvPath = path.join(outputDir, `${stock}.csv`);
        saveToCsv(stockData, stockCsvPath);
        
        // Extract all metrics for the master summary
        const allMetricsData = extractAllMetricsData(stockData, stock);
        appendToMasterCsv(allMetricsData, masterCsvPath, allMetrics);
        
        // Take a screenshot (optional)
        await page.screenshot({ path: path.join(outputDir, `${stock}.png`) });
        
        // Wait before the next stock to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Error processing ${stock}:`, error.message);
        // Continue with the next stock
        continue;
      }
    }
    
    console.log('\nAll stocks processed! Master data available in:', masterCsvPath);
  } catch (error) {
    console.error('Error during main scraping process:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Save the current page as PDF
 * @param {Page} page - Puppeteer page object
 * @param {string} filePath - Path to save the PDF file
 */
async function savePdf(page, filePath) {
  try {
    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });
    console.log(`PDF saved to ${filePath}`);
  } catch (error) {
    console.error(`Error saving PDF: ${error.message}`);
  }
}

/**
 * Find and click the search icon/box on the website
 * @param {Page} page - Puppeteer page object
 */
async function findAndClickSearchIcon(page) {
  try {
    // Try the specific search box element with the class "sp23SearchBox"
    const searchBoxSelector = '.sp23SearchBox';
    await page.waitForSelector(searchBoxSelector, { timeout: 5000 });
    await page.click(searchBoxSelector);
    console.log("Clicked on the search box");
    return;
  } catch (error) {
    console.log("Could not find the search box with .sp23SearchBox class: " + error.message);
  }

  try {
    // Alternative: Try to click the search icon
    const searchIconSelector = '.sp23SearchIcon';
    await page.waitForSelector(searchIconSelector, { timeout: 5000 });
    await page.click(searchIconSelector);
    console.log("Clicked on the search icon");
    return;
  } catch (error) {
    console.log("Could not find the search icon with .sp23SearchIcon class: " + error.message);
  }

  try {
    // Try clicking the SVG icon
    const svgSelector = 'svg.se27SeSearch';
    await page.waitForSelector(svgSelector, { timeout: 5000 });
    await page.click(svgSelector);
    console.log("Clicked on the SVG search icon");
    return;
  } catch (error) {
    console.log("Could not find SVG search icon: " + error.message);
  }

  try {
    // Last resort: Try to find the input field directly
    const inputSelector = 'input#sp23Input, input#globalSearch23, input[placeholder*="Search"]';
    await page.waitForSelector(inputSelector, { timeout: 5000 });
    await page.click(inputSelector);
    console.log("Clicked directly on the search input field");
    return;
  } catch (error) {
    console.log("Could not find search input: " + error.message);
  }

  throw new Error("Could not find or click the search feature");
}

/**
 * Wait for the search input field to be available
 * @param {Page} page - Puppeteer page object
 */
async function waitForSearchInput(page) {
  const inputSelectors = [
    'input[id="globalSearch23"]',
    'input[placeholder*="Search"]',
    'input[placeholder*="search"]',
    'input[class*="search"]',
    'input[class*="Search"]',
    'input[aria-label*="Search"]',
    '.text-input-v1-primary-input',
    'input.inputTextColor',
    'input[type="search"]',
    'input[id*="search"]',
    'input[id*="Search"]'
  ];
  
  for (const selector of inputSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      console.log(`Found search input using selector: ${selector}`);
      return selector;
    } catch (error) {
      // Continue to next selector
    }
  }
  
  // If no predefined selector worked, try to find by attributes
  const inputSelector = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    
    for (const input of inputs) {
      const placeholder = input.getAttribute('placeholder')?.toLowerCase() || '';
      const className = input.className?.toLowerCase() || '';
      const id = input.id?.toLowerCase() || '';
      const ariaLabel = input.getAttribute('aria-label')?.toLowerCase() || '';
      
      if (
        placeholder.includes('search') ||
        className.includes('search') ||
        id.includes('search') ||
        ariaLabel.includes('search') ||
        input.type === 'search'
      ) {
        return input.id ? `#${input.id}` : 
               input.className ? `.${input.className.split(' ').join('.')}` : 
               `input[placeholder="${input.getAttribute('placeholder')}"]`;
      }
    }
    
    return null;
  });
  
  if (!inputSelector) {
    throw new Error('Could not find search input field');
  }
  
  return inputSelector;
}

/**
 * Type the stock name in the search input
 * @param {Page} page - Puppeteer page object
 * @param {string} stockName - Name of the stock to search
 */
async function typeInSearchInput(page, stockName) {
  const inputSelector = await waitForSearchInput(page);
  
  // Clear existing input
  await page.evaluate((selector) => {
    const input = document.querySelector(selector);
    if (input) input.value = '';
  }, inputSelector);
  
  // Type the stock name
  await page.type(inputSelector, stockName, { delay: 100 });
  console.log(`Typed "${stockName}" in search input`);
  
  // Wait for the search to process
  await new Promise(resolve => setTimeout(resolve, 1000));
}

/**
 * Wait for search results and click on the first result
 * @param {Page} page - Puppeteer page object
 * @param {string} stockName - Name of the stock being searched
 */
async function waitForAndClickSearchResult(page, stockName) {
  try {
    // Wait for search results container to appear
    const resultContainerSelector = '.sp23SuggestionPageUi, div[class*="SuggestionPage"]';
    await page.waitForSelector(resultContainerSelector, { timeout: 5000 });
    console.log("Search results appeared");
    
    // Find the first result row
    const firstResultSelector = '.sp23SuggestionPageDataRow, div[id^="suggestions"]';
    await page.waitForSelector(firstResultSelector, { timeout: 3000 });
    
    // Click the first result
    await page.click(firstResultSelector);
    console.log(`Clicked first search result for ${stockName}`);
    
    // Wait for page navigation to complete
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 })
      .catch(() => console.log('No navigation event detected, continuing...'));
    
    // Give the page a moment to render completely
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (error) {
    console.error(`Error clicking search result: ${error.message}`);
    throw error;
  }
}

/**
 * Scrape financial data tables from the stock page
 * @param {Page} page - Puppeteer page object
 * @returns {Object} - The scraped data
 */
async function scrapeStockData(page) {
  // Find all tables and table-like structures
  return await page.evaluate(() => {
    const data = {};
    
    // Helper function to extract table data
    const extractTableData = (tableElement) => {
      const rows = tableElement.querySelectorAll('tr');
      const tableData = {};
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const key = cells[0].textContent.trim();
          const value = cells[1].textContent.trim();
          tableData[key] = value;
        }
      });
      
      return tableData;
    };
    
    // 1. Look for standard tables
    const tables = document.querySelectorAll('table');
    tables.forEach((table, index) => {
      const tableData = extractTableData(table);
      if (Object.keys(tableData).length > 0) {
        data[`Table_${index + 1}`] = tableData;
      }
    });
    
    // 2. Look for tbody elements (common in modern websites)
    const tbodies = document.querySelectorAll('tbody');
    tbodies.forEach((tbody, index) => {
      const tableData = extractTableData(tbody);
      if (Object.keys(tableData).length > 0) {
        data[`TableBody_${index + 1}`] = tableData;
      }
    });
    
    // 3. Look for div-based tables (key-value pairs in divs)
    const divRows = document.querySelectorAll('div[class*="row"], div[class*="Row"]');
    const divTableData = {};
    
    divRows.forEach(row => {
      const keyElement = row.querySelector('div[class*="key"], div[class*="Key"], div[class*="label"], div[class*="Label"]');
      const valueElement = row.querySelector('div[class*="value"], div[class*="Value"]');
      
      if (keyElement && valueElement) {
        const key = keyElement.textContent.trim();
        const value = valueElement.textContent.trim();
        divTableData[key] = value;
      }
    });
    
    if (Object.keys(divTableData).length > 0) {
      data['DivTable'] = divTableData;
    }
    
    // 4. Look specifically for financial metrics that might be in different layouts
    const metrics = [
      'Market Cap', 'P/E Ratio', 'ROE', 'EPS', 'Book Value', 
      'Dividend Yield', 'ROCE', 'Debt to Equity', 'Face Value',
      'Industry P/E', 'P/B Ratio'
    ];
    
    const financialData = {};
    
    metrics.forEach(metric => {
      // Find elements containing this metric
      const elements = Array.from(document.querySelectorAll('*'));
      
      for (const el of elements) {
        if (el.textContent.includes(metric)) {
          // Look for the value in siblings or parent's children
          let valueElement = null;
          
          // Check siblings
          let sibling = el.nextElementSibling;
          while (sibling && !valueElement) {
            if (sibling.textContent.trim() && !metrics.some(m => sibling.textContent.includes(m))) {
              valueElement = sibling;
            }
            sibling = sibling.nextElementSibling;
          }
          
          // Check parent's children if no sibling found
          if (!valueElement && el.parentElement) {
            const siblings = el.parentElement.children;
            for (const child of siblings) {
              if (child !== el && child.textContent.trim() && !metrics.some(m => child.textContent.includes(m))) {
                valueElement = child;
                break;
              }
            }
          }
          
          if (valueElement) {
            financialData[metric] = valueElement.textContent.trim();
            break;
          }
        }
      }
    });
    
    if (Object.keys(financialData).length > 0) {
      data['FinancialMetrics'] = financialData;
    }
    
    // 5. Look for current price and other trading info
    try {
      const priceElement = document.querySelector('.currText, .current-price, [class*="price"], [class*="Price"]');
      if (priceElement) {
        data['CurrentPrice'] = { 'Current Price': priceElement.textContent.trim() };
      }
      
      // Try to find the main trading data
      const tradingMetrics = {
        'High': ['day-high', 'high', 'High'],
        'Low': ['day-low', 'low', 'Low'],
        'Open': ['open', 'Open'],
        'Previous Close': ['prev-close', 'previousClose', 'Previous Close'],
        'Volume': ['volume', 'Volume'],
        '52W High': ['52w-high', '52wHigh', '52W High', '52-Week High'],
        '52W Low': ['52w-low', '52wLow', '52W Low', '52-Week Low']
      };
      
      const tradingData = {};
      
      for (const [metric, classNames] of Object.entries(tradingMetrics)) {
        let found = false;
        
        // Try each class name
        for (const className of classNames) {
          if (found) break;
          
          const elements = document.querySelectorAll(`[class*="${className}"], [id*="${className}"]`);
          for (const el of elements) {
            // Check if this is a label element
            if (el.textContent.includes(metric) || classNames.some(cn => el.className.includes(cn))) {
              // Look for the value in siblings or parent's children
              let valueElement = null;
              
              // Check siblings
              let sibling = el.nextElementSibling;
              while (sibling && !valueElement) {
                if (sibling.textContent.trim() && !Object.keys(tradingMetrics).some(m => sibling.textContent.includes(m))) {
                  valueElement = sibling;
                }
                sibling = sibling.nextElementSibling;
              }
              
              // Check parent's children if no sibling found
              if (!valueElement && el.parentElement) {
                const siblings = el.parentElement.children;
                for (const child of siblings) {
                  if (child !== el && child.textContent.trim() && !Object.keys(tradingMetrics).some(m => child.textContent.includes(m))) {
                    valueElement = child;
                    break;
                  }
                }
              }
              
              if (valueElement) {
                tradingData[metric] = valueElement.textContent.trim();
                found = true;
                break;
              }
            }
          }
        }
      }
      
      if (Object.keys(tradingData).length > 0) {
        data['TradingData'] = tradingData;
      }
    } catch (error) {
      console.error('Error extracting trading data:', error);
    }
    
    return data;
  });
}

/**
 * Save scraped data to a CSV file
 * @param {Object} data - The scraped data object
 * @param {string} filePath - Path to save the CSV file
 */
function saveToCsv(data, filePath) {
  let csvContent = '';
  
  // Process each table in the data
  Object.keys(data).forEach(tableName => {
    const tableData = data[tableName];
    
    // Add table header
    csvContent += `\n${tableName}\n`;
    csvContent += 'Metric,Value\n';
    
    // Add table rows
    Object.keys(tableData).forEach(key => {
      csvContent += `"${key}","${tableData[key]}"\n`;
    });
    
    csvContent += '\n';
  });
  
  // Write to file
  fs.writeFileSync(filePath, csvContent);
  console.log(`Data saved to ${filePath}`);
}

/**
 * Extract all metrics for comprehensive CSV
 * @param {Object} data - The scraped data for a stock
 * @param {string} stockName - The stock name
 * @returns {Object} - All metrics data object
 */
function extractAllMetricsData(data, stockName) {
  const allMetrics = {
    Stock: stockName,
    URL: data['URLData']?.['URL'] || ''
  };
  
  // Search for all metrics in all tables
  Object.values(data).forEach(table => {
    Object.entries(table).forEach(([key, value]) => {
      // Skip if value appears to be code or script
      if (value.includes('function(') || value.includes('var ') || 
          value.includes('const ') || value.includes('if (') || 
          value.includes('for (') || value.includes('Promise.')) {
        return;
      }
      
      // Clean up the key and value to standardize
      const cleanKey = key.trim();
      // Remove commas and clean value
      const cleanValue = value.trim()
        .replace(/,/g, '') // Remove commas for CSV compatibility
        .replace(/\s+/g, ' '); // Replace multiple spaces with single space
      
      // Map common variations of keys to standard names
      const keyMap = {
        'Market Capitalization': 'Market Cap',
        'Mcap': 'Market Cap',
        'P/E': 'P/E Ratio',
        'PE Ratio': 'P/E Ratio',
        'PE': 'P/E Ratio',
        'Price to Earning': 'P/E Ratio',
        'Return on Equity': 'ROE',
        'Earning Per Share': 'EPS',
        'Earnings Per Share': 'EPS',
        'Dividend Yield %': 'Dividend Yield',
        'Div Yield': 'Dividend Yield',
        'Book Val': 'Book Value',
        'BookValue': 'Book Value',
        'BV': 'Book Value',
        'Return on Capital Employed': 'ROCE',
        'Debt/Equity': 'Debt to Equity',
        'Debt-Equity': 'Debt to Equity',
        'D/E Ratio': 'Debt to Equity',
        'Face Val': 'Face Value',
        'FV': 'Face Value',
        'Industry PE': 'Industry P/E',
        'Sector P/E': 'Industry P/E',
        'Price to Book Value': 'P/B Ratio',
        'Price/Book': 'P/B Ratio',
        'PB Ratio': 'P/B Ratio'
      };
      
      // Use mapped key if available, otherwise use the original key
      let standardKey = null;
      
      // Check if the key exactly matches one of our desired metrics
      for (const [metricKey, metricValue] of Object.entries(keyMap)) {
        if (cleanKey === metricKey) {
          standardKey = metricValue;
          break;
        }
      }
      
      // If no exact match, check if the key contains one of our metrics
      if (!standardKey) {
        for (const [metricKey, metricValue] of Object.entries(keyMap)) {
          if (cleanKey.includes(metricKey)) {
            standardKey = metricValue;
            break;
          }
        }
        
        // Also check direct matches to the standard metrics
        if (!standardKey) {
          const allMetricNames = [
            'Market Cap', 'P/E Ratio', 'ROE', 'EPS', 'Dividend Yield',
            'Book Value', 'ROCE', 'Debt to Equity', 'Face Value', 'Industry P/E', 'P/B Ratio'
          ];
          
          for (const metric of allMetricNames) {
            if (cleanKey === metric || cleanKey.includes(metric)) {
              standardKey = metric;
              break;
            }
          }
        }
      }
      
      // Store the metric if it maps to one of our desired metrics
      if (standardKey && cleanValue && !allMetrics[standardKey]) {
        allMetrics[standardKey] = cleanValue;
      }
    });
  });
  
  return allMetrics;
}

/**
 * Append a stock's complete data to the master CSV
 * @param {Object} allMetrics - Complete data for a stock
 * @param {string} filePath - Path to the master CSV file
 * @param {Array} metrics - List of all possible metrics
 */
function appendToMasterCsv(allMetrics, filePath, metrics) {
  // Start with stock name
  let row = `"${allMetrics.Stock}"`;
  
  // Add each metric in the correct order, escaping values properly for CSV
  metrics.forEach(metric => {
    let value = allMetrics[metric] || '';
    
    // Skip if value appears to be code
    if (value.includes('function(') || value.includes('var ') || 
        value.includes('const ') || value.includes('if (') || 
        value.includes('for (') || value.includes('Promise.')) {
      value = '';
    }
    
    // Properly escape double quotes in CSV values
    value = value.replace(/"/g, '""');
    row += `,${value ? `"${value}"` : ''}`;
  });
  
  row += '\n';
  fs.appendFileSync(filePath, row);
}

// Export functions
module.exports = {
  scrapeStocksData,
  ALL_STOCKS
};

// Example usage:
scrapeStocksData('https://groww.in/search', 'stock_data');