import { Metadata } from "next";
import DiscordIntegrationClient from "./DiscordIntegrationClient";

export const metadata: Metadata = {
  title: "Discord Integration - CartelBot",
  description: "Connect Discord channels to automatically execute trading signals",
};

export default function DiscordIntegrationPage() {
  return <DiscordIntegrationClient />;
}
