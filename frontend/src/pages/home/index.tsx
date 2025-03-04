import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface Stock {
  symbol: string;
  current_price: number;
  price_change: number;
  percent_change: number;
  volatility: number;
  sharpe_ratio: number;
  skewness: number;
  kurtosis: number;
  current_trend: string;
  trend_strength: string;
  adx: number;
  rsi: number;
  macd: number;
  macd_signal: number;
  macd_histogram: number;
  stochastic_k: number;
  stochastic_d: number;
  bollinger_width: number;
  atr: number;
  sma_20: number;
  sma_50: number;
  sma_200: number;
  ema_12: number;
  ema_26: number;
  support_resistance: string;
  trading_signals: string;
  momentum_14: number;
  momentum_30: number;
}

interface Message {
  role: string;
  text: string;
}

const genAI = new GoogleGenerativeAI("AIzaSyB9O0DPTznEhv0I_3ca8iQe4zO_l6BnFJ0");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const Home: React.FC = () => {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [search, setSearch] = useState<string>("");
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [userMessage, setUserMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [chat, setChat] = useState<any>(null);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    fetch("/nifty50_data.csv")
      .then((response) => response.text())
      .then((data) => {
        const rows = data.split("\n").slice(1).filter(row => row.trim() !== "");
        const parsedStocks: Stock[] = rows.map((row) => {
          const values = row.split(",").map(val => val.trim());
          return {
            symbol: values[1] || "Unknown",
            current_price: parseFloat(values[6]) || 0,
            price_change: parseFloat(values[7]) || 0,
            percent_change: parseFloat(values[8]) || 0,
            volatility: parseFloat(values[13]) || 0,
            sharpe_ratio: parseFloat(values[17]) || 0,
            skewness: parseFloat(values[18]) || 0,
            kurtosis: parseFloat(values[19]) || 0,
            current_trend: values[20] || "Unknown",
            trend_strength: values[21] || "Unknown",
            adx: parseFloat(values[22]) || 0,
            rsi: parseFloat(values[23]) || 0,
            macd: parseFloat(values[24]) || 0,
            macd_signal: parseFloat(values[25]) || 0,
            macd_histogram: parseFloat(values[26]) || 0,
            stochastic_k: parseFloat(values[27]) || 0,
            stochastic_d: parseFloat(values[28]) || 0,
            bollinger_width: parseFloat(values[29]) || 0,
            atr: parseFloat(values[30]) || 0,
            sma_20: parseFloat(values[31]) || 0,
            sma_50: parseFloat(values[32]) || 0,
            sma_200: parseFloat(values[33]) || 0,
            ema_12: parseFloat(values[34]) || 0,
            ema_26: parseFloat(values[35]) || 0,
            support_resistance: values[37] || "{}",
            trading_signals: values[38] || "[]",
            momentum_14: parseFloat(values[39]) || 0,
            momentum_30: parseFloat(values[40]) || 0,
          };
        }).filter(stock => stock.symbol !== "Unknown");
        setStocks(parsedStocks);
      })
      .catch((error) => console.error("Error loading CSV data", error));
  }, []);

  const handleStockSelection = async (stock: Stock) => {
    setSelectedStock(stock);
    setLoading(true);
    setError(false);
    try {
      console.log(
        `
              Analyze stock ${stock.symbol} with the following indicators:
              - Current Price: ${stock.current_price}
              - Price Change: ${stock.price_change}
              - Percent Change: ${stock.percent_change}
              - Volatility: ${stock.volatility}
              - Sharpe Ratio: ${stock.sharpe_ratio}
              - Skewness: ${stock.skewness}
              - Kurtosis: ${stock.kurtosis}
              - Current Trend: ${stock.current_trend}
              - Trend Strength: ${stock.trend_strength}
              - ADX: ${stock.adx}
              - RSI: ${stock.rsi}
              - MACD: ${stock.macd}
              - MACD Signal: ${stock.macd_signal}
              - MACD Histogram: ${stock.macd_histogram}
              - Stochastic K: ${stock.stochastic_k}
              - Stochastic D: ${stock.stochastic_d}
              - Bollinger Width: ${stock.bollinger_width}
              - ATR: ${stock.atr}
              - SMA 20: ${stock.sma_20}
              - SMA 50: ${stock.sma_50}
              - SMA 200: ${stock.sma_200}
              - EMA 12: ${stock.ema_12}
              - EMA 26: ${stock.ema_26}
              - Support & Resistance: ${stock.support_resistance}
              - Trading Signals: ${stock.trading_signals}
              - Momentum 14: ${stock.momentum_14}
              - Momentum 30: ${stock.momentum_30}

              Provide a detailed analysis and trading recommendation.
              The example format is as follows:
              Summary: 
              - Tell if user should Buy/Sell/Hold the stock.
              Context:
              - Provide a brief analysis of the stock. and why you suggest what you did. also give indicator which the user should look  into
              which you used for the analysis. 

              Format the response in Markdown.`
      )
      const chatInstance = model.startChat({
        history: [
          {
        role: "user",
        parts: [{ text: `
          Analyze stock ${stock.symbol} with the following indicators:
          - Current Price: ${stock.current_price}
          - Price Change: ${stock.price_change}
          - Percent Change: ${stock.percent_change}
          - Volatility: ${stock.volatility}
          - Sharpe Ratio: ${stock.sharpe_ratio}
          - Skewness: ${stock.skewness}
          - Kurtosis: ${stock.kurtosis}
          - Current Trend: ${stock.current_trend}
          - Trend Strength: ${stock.trend_strength}
          - ADX: ${stock.adx}
          - RSI: ${stock.rsi}
          - MACD: ${stock.macd}
          - MACD Signal: ${stock.macd_signal}
          - MACD Histogram: ${stock.macd_histogram}
          - Stochastic K: ${stock.stochastic_k}
          - Stochastic D: ${stock.stochastic_d}
          - Bollinger Width: ${stock.bollinger_width}
          - ATR: ${stock.atr}
          - SMA 20: ${stock.sma_20}
          - SMA 50: ${stock.sma_50}
          - SMA 200: ${stock.sma_200}
          - EMA 12: ${stock.ema_12}
          - EMA 26: ${stock.ema_26}
          - Support & Resistance: ${stock.support_resistance}
          - Trading Signals: ${stock.trading_signals}
          - Momentum 14: ${stock.momentum_14}
          - Momentum 30: ${stock.momentum_30}

          Provide a detailed analysis and trading recommendation.
          The example format is as follows:
          Recommendation: 
          - Tell if user should Buy/Sell/Hold the stock. Keep the summary short and to the point. 
          Context:
          - Provide a brief analysis of the stock. and why you suggest what you did. also give indicator which the user should look into
          which you used for the analysis. 
          - Disclaimer that you are just an LLM and not a financial advisor.

          Format the response in Markdown.` }],
          },
        ],
      });
      setChat(chatInstance);
      const result = await chatInstance.sendMessage("Provide an initial analysis");
      const text = await result.response.text();
      setChatMessages([{ role: "assistant", text }]);
    } catch (error) {
      console.error("Error fetching analysis", error);
      setError(true);
    }
    setLoading(false);
  };
  const handleSendMessage = async () => {
    if (!chat) return;
    setError(false);
    const newMessages = [...chatMessages, { role: "user", text: userMessage }];
    setChatMessages(newMessages);
    setUserMessage("");
    setLoading(true);
    try {
      const result = await chat.sendMessage(userMessage);
      const text = await result.response.text();
      setChatMessages([...newMessages, { role: "assistant", text }]);
    } catch (error) {
      console.error("Error in chat response", error);
      setError(true);
    }
    setLoading(false);
  };

  return (
    <div className="h-screen flex flex-col p-6 max-w-5xl mx-auto">
      {error ? (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <h1 className="text-2xl font-bold text-red-500">Something went wrong!</h1>
          <p className="text-gray-600">Please try again later or select a different stock.</p>
          <Button onClick={() => setSelectedStock(null)} className="mt-4">Go Back</Button>
        </div>
      ) : !selectedStock ? (
        <>
          <h1 className="text-2xl font-bold mb-4">Nifty 50 Stock Analysis</h1>
          <Input
            placeholder="Search stock symbol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-4"
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {stocks
              .filter((stock) => stock.symbol?.toLowerCase().includes(search.toLowerCase()))
              .map((stock) => (
                <motion.div whileHover={{ scale: 1.05 }} key={stock.symbol} className="p-2">
                  <Button onClick={() => handleStockSelection(stock)} className="w-full">{stock.symbol}</Button>
                </motion.div>
              ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col flex-grow p-6 border rounded shadow-lg h-full">
          <h2 className="text-xl font-semibold mb-2">Chat about {selectedStock.symbol}</h2>
          <div className="flex-grow overflow-auto border p-3 rounded mb-3">
            {loading && <p className="text-center text-gray-500">Loading...</p>}
            {chatMessages.map((msg, index) => (
              <div key={index} className={msg.role === "user" ? "text-right" : "text-left"}>
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            ))}
          </div>
          <div className="flex items-center space-x-2">
            <Input
              placeholder="Ask a question..."
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
              className="flex-grow"
            />
            <Button onClick={handleSendMessage} className="w-32">Send</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
