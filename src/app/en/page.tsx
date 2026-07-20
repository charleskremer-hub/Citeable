import type { Metadata } from "next";
import HomeClient from "../HomeClient";

export const metadata: Metadata = {
  title: "GetPick — The GEO agent for DTC brands",
  description: "It gets your brand recommended by ChatGPT and Gemini — diagnosis, content, monitoring. No agency needed. Free audit in 2 minutes.",
};

export default function EnglishHome() {
  return <HomeClient locale="en" />;
}
