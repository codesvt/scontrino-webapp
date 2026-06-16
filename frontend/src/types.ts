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
};

export type KiDaten = {
  datum: string | null;
  gesamtbetrag: number;
  hauptkategorie: string;
  alarm: boolean;
  ausreisser: Ausreisser[];
};

export type Ausreisser = {
  artikel_raw: string;
  vorgeschlagene_kategorie: string;
};

export type LedgerEntry = {
  id: number;
  datum: string;
  gesamtbetrag: number;
  kategorie: string;
  belegRohId: number | null;
  notiz: string;
};

export type Config = {
  kategorien: string[];
  kategorieMapping: Record<string, string>;
};
