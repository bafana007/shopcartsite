import { useEffect, useState } from "react";
import { watchProgress } from "../lib/firebase.js";

export default function ProgressBar() {
  const [progress, setProgress] = useState({ value: 0, label: "", updatedAt: null });

  useEffect(() => {
    return watchProgress((next) => setProgress(next));
  }, []);

  if (progress.value <= 0 && !progress.label) return null;

  return (
    <div className="progress-bar-wrap" role="progressbar" aria-valuenow={progress.value} aria-valuemin="0" aria-valuemax="100">
      {progress.label && <span className="progress-label">{progress.label}</span>}
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress.value}%` }} />
      </div>
      <span className="progress-value">{progress.value}%</span>
    </div>
  );
}
