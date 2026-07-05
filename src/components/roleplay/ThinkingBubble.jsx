export function ThinkingBubble({ topicEmoji }) {
  return (
    <div className="flex justify-start mb-4">
      <span className="text-2xl mr-2 self-end mb-1">{topicEmoji}</span>
      <div style={{
        backgroundColor: '#EEF0FF',
        borderRadius: '4px 16px 16px 16px',
        padding: '14px 18px',
        display: 'flex',
        gap: 6,
        alignItems: 'center'
      }}>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            style={{
              width: 8, height: 8,
              borderRadius: '50%',
              backgroundColor: '#6C63FF',
              display: 'inline-block',
              animation: 'bounce 1s infinite',
              animationDelay: `${i * 0.15}s`
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
