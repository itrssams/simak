import React from 'react';
import { Play } from 'lucide-react';
import TaskLogbook from './TaskLogbook';
import './MyLogbook.css';

export default function LogbookLiveTrack() {
    return (
        <div className="logbook-page">
            <div className="logbook-hero">
                <div className="logbook-title">
                    <span><Play size={22} /></span>
                    <div>
                        <h1>Live Track (Realtime)</h1>
                        <p>Catat dan lacak aktivitas pekerjaan Anda secara realtime dengan timer interaktif.</p>
                    </div>
                </div>
            </div>
            
            <TaskLogbook />
        </div>
    );
}
