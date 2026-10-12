"use client";
import { AppShell } from "../../../components/AppShell";
import { SocialHub } from "../../../components/SocialHub";

export default function Page() {
  return <AppShell title="Social">{(s) => <SocialHub me={s.profile.id} campus={s.profile.campus} />}</AppShell>;
}
