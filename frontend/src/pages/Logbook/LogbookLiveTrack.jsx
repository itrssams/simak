import React from 'react';
import { Play } from 'lucide-react';
import TaskLogbook from './TaskLogbook';
import './MyLogbook.css';

export default function LogbookLiveTrack() {
    return (
        <div className="logbook-page" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            <div className="logbook-hero" style={{ marginBottom: '24px' }}>
                <div className="logbook-title">
                    <span><Play size={22} /></span>
                    <div>
                        <h1>Live Track (Realtime)</h1>
                        <p>Catat pekerjaan Anda secara realtime dengan fitur timer.</p>
                    </div>
                </div>
            </div>
            
            <TaskLogbook />
        </div>
    );
}
