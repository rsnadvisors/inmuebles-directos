"use client";

import { useId, useState } from "react";

export default function PasswordInput({ label, name, autoComplete, minLength, disabled, describedBy }: {
  label: string; name: string; autoComplete: "current-password" | "new-password";
  minLength?: number; disabled?: boolean; describedBy?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className="password-control">
    <label htmlFor={id}>{label}</label>
    <div className="password-field">
      <input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete}
        required minLength={minLength} disabled={disabled} aria-describedby={describedBy} />
      <button className="password-eye" type="button" disabled={disabled} aria-controls={id}
        aria-label={`${visible ? "Ocultar" : "Mostrar"} ${label.toLowerCase()}`} aria-pressed={visible}
        onClick={() => setVisible(value => !value)}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="m3 3 18 18" />}
        </svg>
      </button>
    </div>
  </div>;
}
