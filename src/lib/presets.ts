// Ready-made song sets. Each set is a list of artists (searched on Apple Music
// Thailand), so a set costs at most one search per artist and wrong choices can
// come from the same artist. Edit freely: names are matched loosely by iTunes.

export type Preset = {
  id: string;
  name: string;
  detail: string;
  artists: string[]; // up to 8
};

export const PRESETS: Preset[] = [
  {
    id: "rock-2000s",
    name: "ร็อกยุค 2000",
    detail: "Bodyslam, Clash, Silly Fools, Big Ass…",
    artists: ["Bodyslam", "Clash", "Silly Fools", "Big Ass", "Potato", "Loso", "Labanoon", "Zeal"],
  },
  {
    id: "pop-90s",
    name: "ป๊อปยุค 90",
    detail: "เบิร์ด ธงไชย, Christina, ใหม่ เจริญปุระ…",
    artists: ["เบิร์ด ธงไชย", "Christina Aguilar", "ใหม่ เจริญปุระ", "มอส ปฏิภาณ", "Tata Young", "นิโคล เทริโอ", "Raptor", "อัสนี-วสันต์"],
  },
  {
    id: "heartbreak",
    name: "เพลงช้า อกหัก",
    detail: "Getsunova, Three Man Down, Lula…",
    artists: ["Getsunova", "Three Man Down", "Lula", "Klear", "Ink Waruntorn", "Musketeers", "Tilly Birds", "Palmy"],
  },
  {
    id: "tpop",
    name: "T-pop ตอนนี้",
    detail: "Jeff Satur, Billkin, PROXIE, 4EVE…",
    artists: ["Jeff Satur", "Billkin", "PP Krit", "PROXIE", "4EVE", "PiXXiE", "BUS", "LYKN"],
  },
  {
    id: "indie",
    name: "อินดี้ ฟังสบาย",
    detail: "Polycat, Scrubb, Phum Viphurit…",
    artists: ["Polycat", "Scrubb", "Phum Viphurit", "Gym and Swim", "Safeplanet", "Yented", "H 3 F", "Lipta"],
  },
  {
    id: "lukthung",
    name: "ลูกทุ่ง หมอลำ",
    detail: "ไผ่ พงศธร, ตั๊กแตน ชลดา, ก้อง ห้วยไร่…",
    artists: ["ไผ่ พงศธร", "ตั๊กแตน ชลดา", "ก้อง ห้วยไร่", "ต่าย อรทัย", "ศิริพร อำไพพงษ์", "มนต์แคน แก่นคูน", "ลำไย ไหทองคำ", "เบียร์ พร้อมพงษ์"],
  },
  {
    id: "hiphop",
    name: "ฮิปฮอปไทย",
    detail: "Thaitanium, Youngohm, F.HERO…",
    artists: ["Thaitanium", "Youngohm", "F.HERO", "MILLI", "SPRITE", "1MILL", "URBOYTJ", "Twopee"],
  },
];

export function presetById(id: string) {
  return PRESETS.find((p) => p.id === id);
}
