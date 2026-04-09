/**
 * @fileoverview 맵 로딩 스켈레톤 UI
 * Next.js 16의 Streaming SSR을 활용하여 즉각적인 로딩 피드백을 제공합니다.
 */
export default function MapLoading() {
  return (
    <div style={{ 
      width: '100%', 
      height: '100dvh', 
      backgroundColor: '#0d0d0d',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* 배경 은은한 광원 효과 */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(242,169,0,0.05) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      {/* 로고 스켈레톤 */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '4px',
        marginBottom: '24px',
        animation: 'pulse 2s infinite ease-in-out'
      }}>
        <div style={{ 
          fontSize: '42px', 
          fontWeight: 900, 
          fontStyle: 'italic', 
          color: 'transparent',
          WebkitTextStroke: '1.5px rgba(242,169,0,0.2)',
          letterSpacing: '-2px'
        }}>
          BG
        </div>
        <div style={{ 
          fontSize: '42px', 
          fontWeight: 900, 
          fontStyle: 'italic', 
          color: 'rgba(255,255,255,0.1)',
          letterSpacing: '-2px'
        }}>
          MS
        </div>
      </div>

      {/* 로딩 바 */}
      <div style={{
        width: '200px',
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
          width: '40%',
          backgroundColor: '#F2A900',
          boxShadow: '0 0 10px #F2A900',
          animation: 'loading-slide 1.5s infinite ease-in-out'
        }} />
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.98); }
          50% { opacity: 0.6; transform: scale(1); }
        }
        @keyframes loading-slide {
          0% { left: -40%; }
          100% { left: 100%; }
        }
      `}} />
    </div>
  );
}
