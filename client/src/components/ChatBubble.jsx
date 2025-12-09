import './ChatBubble.css';

function ChatBubble({ message, isUser }) {
  return (
    <div className={`chat-bubble ${isUser ? 'user' : 'assistant'}`}>
      <div className="bubble-content">
        {message.text}
      </div>
      {!isUser && message.using_knowledgebase && (
        <div className="context-indicator">
          ✓ Using knowledgebase context
        </div>
      )}
    </div>
  );
}

export default ChatBubble;
