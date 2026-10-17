"use client";
import { AVATAR_OPTIONS, AVATAR_PRESETS, avatarEquals, avatarPart, randomAvatar, type Avatar, type AvatarPart } from "@campus/domain";
import { AvatarStage } from "./AvatarStage";

const PARTS: { part: AvatarPart; label: string; color?: boolean }[] = [
  { part: "body", label: "Body" }, { part: "skin", label: "Skin", color: true }, { part: "hair", label: "Hair" }, { part: "hairColor", label: "Hair colour", color: true },
  { part: "face", label: "Face" }, { part: "top", label: "Top" }, { part: "outfit", label: "Outfit colour", color: true }, { part: "headwear", label: "Hat" }, { part: "accessory", label: "Accessory" }, { part: "bottom", label: "Trousers" },
  { part: "shoes", label: "Shoes" }, { part: "backpack", label: "Backpack" },
];

/** Shared by onboarding and the profile editor: presets, "surprise me" and every avatar part. */
export function AvatarBuilder({ value, onChange }: { value: Avatar; onChange: (a: Avatar) => void }) {
  return (
    <>
      <AvatarStage value={value} />
      <div className="field">
        <label>Start from a look</label>
        <div className="chips">
          {AVATAR_PRESETS.map((p) => <button key={p.id} type="button" className="chip" aria-pressed={avatarEquals(value, p.avatar)} onClick={() => onChange(p.avatar)}>{p.name}</button>)}
          <button type="button" className="chip" onClick={() => onChange(randomAvatar((Math.random() * 2 ** 32) >>> 0))}>Surprise me</button>
        </div>
      </div>
      {PARTS.map(({ part, label, color }) => (
        <div className="field" key={part}>
          <label>{label}</label>
          <div className={color ? "swatches" : "chips"}>
            {(AVATAR_OPTIONS[part] as readonly string[]).map((v) => color
              ? <button key={v} type="button" className="swatch" style={{ background: v }} aria-label={`${label} ${v}`} aria-pressed={avatarPart(value, part) === v} onClick={() => onChange({ ...value, [part]: v } as Avatar)} />
              : <button key={v} type="button" className="chip" aria-pressed={avatarPart(value, part) === v} onClick={() => onChange({ ...value, [part]: v } as Avatar)}>{v.replace("_", " ")}</button>)}
          </div>
        </div>
      ))}
    </>
  );
}
