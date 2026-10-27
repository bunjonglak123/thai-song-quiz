import { Suspense } from "react";
import RoomClient from "./room-client";

// The room is entirely client-side (realtime + browser storage); the code
// comes from the URL at runtime, so stream it in behind a Suspense boundary.
export default function RoomPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <RoomClient />
    </Suspense>
  );
}
