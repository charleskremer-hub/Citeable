import type { Metadata } from "next";
import HomeClient from "../HomeClient";

export const metadata: Metadata = {
  title: "Citeable — Free AI visibility audit",
  description: "Run the free audit, see your AI visibility score, then get the fixes written for you.",
};

export default function EnglishHome() {
  return <HomeClient locale="en" />;
}
