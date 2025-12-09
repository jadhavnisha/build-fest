import { useState, useRef, useEffect } from 'react';
import ChatBubble from './components/ChatBubble';
import { sendChatMessage, checkHealth } from './services/api';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Check server health on mount
    checkHealth()
      .then(status => setServerStatus(status))
      .catch(() => setServerStatus({ status: 'error' }));
  }, []);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = {
      text: input,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await sendChatMessage(input);
      
      const assistantMessage = {
        text: response.answer,
        isUser: false,
        using_knowledgebase: response.using_knowledgebase,
        sources: response.sources,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage = {
        text: `Error: ${error.message}`,
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🤖 RAG Chatbot</h1>
        <span className="subtitle">Offline - Powered by Ollama</span>
        {serverStatus && (
          <div className={`status ${serverStatus.status}`}>
            {serverStatus.ollamaAvailable && serverStatus.vectorStoreExists 
              ? '● Ready' 
              : serverStatus.ollamaAvailable 
              ? '● Ollama Ready (Run embedding)'
              : '● Ollama Not Available'}
          </div>
        )}
      </header>

      <div className="chat-container">
        <div className="messages">
          {messages.length === 0 && (
            <div className="empty-state">
              <p>Ask me anything about the knowledgebase!</p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <ChatBubble key={idx} message={msg} isUser={msg.isUser} />
          ))}
          {loading && (
            <div className="loading">
              <span></span>
              <span></span>
              <span></span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            disabled={loading}
            rows={1}
          />
          <button onClick={handleSend} disabled={loading || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
