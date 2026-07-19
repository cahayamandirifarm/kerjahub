"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Setting {
  key: string;
  value: string;
  description: string | null;
}

const BOOLEAN_KEYS = ["nearby_jobs_enabled", "nearby_workers_enabled", "gps_request_enabled"];
const SELECT_OPTIONS: Record<string, string[]> = {
  default_radius_km: ["5", "10", "20", "30", "50", "100"],
  map_unit: ["meter", "km"]
};

export default function SettingsForm({ initialSettings }: { initialSettings: Setting[] }) {
  const supabase = createClient();
  const [settings, setSettings] = useState(initialSettings);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  async function saveValue(key: string, value: string) {
    setSavingKey(key);
    await supabase.from("platform_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
    setSavingKey(null);
    setSavedKey(key);
    setTimeout(() => setSavedKey(null), 1500);
  }

  function updateLocal(key: string, value: string) {
    setSettings((s) => s.map((row) => (row.key === key ? { ...row, value } : row)));
  }

  return (
    <div className="space-y-3">
      {settings.map((s) => (
        <div key={s.key} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <p className="font-semibold text-sm">{s.key}</p>
            {s.description && <p className="text-xs text-ink/50">{s.description}</p>}
          </div>

          <div className="flex items-center gap-2">
            {BOOLEAN_KEYS.includes(s.key) ? (
              <button
                onClick={() => {
                  const next = s.value === "true" ? "false" : "true";
                  updateLocal(s.key, next);
                  saveValue(s.key, next);
                }}
                className={`w-11 h-6 rounded-full transition relative ${s.value === "true" ? "bg-turquoise" : "bg-line"}`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${s.value === "true" ? "left-5" : "left-0.5"}`}
                />
              </button>
            ) : SELECT_OPTIONS[s.key] ? (
              <select
                className="input !py-1.5 !w-32"
                value={s.value}
                onChange={(e) => {
                  updateLocal(s.key, e.target.value);
                  saveValue(s.key, e.target.value);
                }}
              >
                {SELECT_OPTIONS[s.key].map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input !py-1.5 !w-40"
                value={s.value}
                onChange={(e) => updateLocal(s.key, e.target.value)}
                onBlur={(e) => saveValue(s.key, e.target.value)}
              />
            )}
            {savingKey === s.key && <span className="text-xs text-ink/40">menyimpan...</span>}
            {savedKey === s.key && <span className="text-xs text-turquoise">tersimpan</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
