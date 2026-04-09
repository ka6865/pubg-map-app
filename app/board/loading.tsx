/**
 * @fileoverview 게시판 로딩 스켈레톤 UI
 */
export default function BoardLoading() {
  return (
    <div style={{ 
      width: '100%', 
      height: '100dvh', 
      backgroundColor: '#0d0d0d',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '4px',
        marginBottom: '24px',
        animation: 'pulse 2s infinite ease-in-out'
      }}>
        <div style={{ 
          fontSize: '32px', 
          fontWeight: 900, 
          fontStyle: 'italic', 
          color: 'transparent',
          WebkitTextStroke: '1px rgba(255,255,255,0.2)',
          letterSpacing: '-1.5px'
        }}>
          COMMUNITY
        </div>
      </div>

      <div style={{
        width: '150px',
        height: '2px',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: '1px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: '30%',
          backgroundColor: '#F2A900',
          animation: 'loading-slide 1.2s infinite ease-in-out'
        }} />
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
        @keyframes loading-slide {
          0% { left: -30%; }
          100% { left: 100%; }
        }
      `}} />
    </div>
  );
}
