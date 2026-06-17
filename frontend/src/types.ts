export type UploadResult = {
  status: "success" | "error" | "duplicate";
  msg: string;
  id: number | null;
};

export type UploadJob = {
  jobId: string;
  total: number;
};

export type UploadStatus = {
  total: number;
  done: number;
  running: boolean;
  apiBlocked: boolean;
  cancelled: boolean;
  erfolgreich: number;
  dubletten: number;
  fehler: number;
  results: Record<string, UploadResult>;
  savedIds: number[];
};

export type Receipt = {
  id: number;
  dateiname: string;
  kiDaten: KiDaten;
  hatBild: boolean;
  benutzer: string;
};

export type KiDaten = {
  datum: string | null;
  gesamtbetrag: number | null;
  hauptkategorie: string;
  alarm: boolean;
  ausreisser: Ausreisser[];
  notiz_vorschlag?: string | null;
};

export type Ausreisser = {
  artikel_raw: string;
  vorgeschlagene_kategorie: string;
};

export type SplitEntry = {
  id: string;
  betrag: number;
  kategorie: string;
  notiz: string;
};

export type LedgerEntry = {
  id: number;
  datum: string;
  gesamtbetrag: number;
  kategorie: string;
  belegRohId: number | null;
  notiz: string;
  benutzer: string;
  erstellt: string;
};

export type Config = {
  kategorien: string[];
  kategorieMapping: Record<string, string>;
};
