import './LoadingScreen.css';

export default function LoadingScreen({ text = 'Memuat sistem...' }) {
    return (
        <div className="simak-loading-screen">
            <div className="simak-loading-container">
                {/* Glowing Orbital Ring */}
                <div className="simak-loading-ring-wrap">
                    <div className="simak-loading-ring"></div>
                    <div className="simak-loading-ring-inner"></div>
                    <div className="simak-loading-logo-box">
                        <img
                            src="/logo.png"
                            alt="SIMAK Logo"
                            className="simak-loading-logo"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                            }}
                        />
                    </div>
                </div>

                {/* Typography */}
                <div className="simak-loading-text-wrap">
                    <h2 className="simak-loading-title">SIMAK</h2>
                    <p className="simak-loading-sub">{text}</p>
                </div>
            </div>
        </div>
    );
}
