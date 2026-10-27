// Offline test data, used only when MOCK_MUSIC=1.
// Titles are made up; audio is a generated tone from /api/mock-audio.

import type { PoolTrack } from "./music";

const SONGS: [string, string][] = [
  ["ฝนตกที่ท่าเรือ", "วงทดสอบ A"],
  ["คืนที่ดาวหาย", "วงทดสอบ A"],
  ["รถไฟสายสุดท้าย", "วงทดสอบ A"],
  ["แสงไฟริมทาง", "วงทดสอบ A"],
  ["ทะเลในเมือง", "นักร้อง B"],
  ["จดหมายไม่ได้ส่ง", "นักร้อง B"],
  ["ลมหนาวเดือนสาม", "นักร้อง B"],
  ["ใต้ต้นจามจุรี", "นักร้อง B"],
  ["Midnight Soi 8", "Test Band C"],
  ["Rainy Bangkok", "Test Band C"],
  ["ร้านกาแฟปิดแล้ว", "Test Band C"],
  ["ถนนเส้นเดิม", "Test Band C"],
];

export function mockPool(): PoolTrack[] {
  return SONGS.map(([title, artist], i) => ({
    id: `mock-${i}`,
    title,
    rawTitle: title,
    artist,
    album: "Mock Album",
    previewUrl: `/api/mock-audio?f=${220 + i * 40}`,
    group: artist,
  }));
}
