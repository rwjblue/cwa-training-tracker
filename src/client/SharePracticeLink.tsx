import { useState } from 'react';
import { Link } from 'lucide-react';

export default function SharePracticeLink() {
  const [status, setStatus] = useState('');
  return (
    <div className="practice-share">
      <button
        className="button outline small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            setStatus('Practice link copied.');
          } catch {
            setStatus('Copy the address from your browser to share this practice.');
          }
        }}
      >
        <Link size={14} /> Copy practice link
      </button>
      <span role="status">{status}</span>
    </div>
  );
}
