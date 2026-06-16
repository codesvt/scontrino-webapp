const BASE = '/api';

export async function getConfig() {
  const r = await fetch(`${BASE}/config`);
  return r.json();
}

export async function uploadFiles(files: FileList | File[]): Promise<{ jobId: string; total: number }> {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  const r = await fetch(`${BASE}/upload`, { method: 'POST', body: fd });
  return r.json();
}

export async function getUploadStatus(jobId: string) {
  const r = await fetch(`${BASE}/upload/${jobId}`);
  return r.json();
}

export async function cancelUpload(jobId: string) {
  await fetch(`${BASE}/upload/${jobId}/cancel`, { method: 'POST' });
}

export async function getReceipts() {
  const r = await fetch(`${BASE}/receipts`);
  return r.json();
}

export function getReceiptImageUrl(receiptId: number) {
  return `${BASE}/receipts/${receiptId}/image`;
}

export async function bookReceipt(receiptId: number, data: { datum: string; betrag: number; kategorie: string; notiz: string }) {
  const r = await fetch(`${BASE}/receipts/${receiptId}/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteReceipt(receiptId: number) {
  await fetch(`${BASE}/receipts/${receiptId}`, { method: 'DELETE' });
}

export async function getLedger() {
  const r = await fetch(`${BASE}/ledger`);
  return r.json();
}

export async function addManualEntry(data: { datum: string; betrag: number; kategorie: string; notiz: string }) {
  const r = await fetch(`${BASE}/ledger/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteLedgerEntry(entryId: number, mitBeleg: boolean = true) {
  await fetch(`${BASE}/ledger/${entryId}?mit_beleg=${mitBeleg}`, { method: 'DELETE' });
}

export async function checkDuplicate(receiptId: number, datum: string, betrag: number) {
  const r = await fetch(`${BASE}/receipts/${receiptId}/duplicate-check?datum=${datum}&betrag=${betrag}`);
  return r.json() as Promise<{ duplicate: boolean; treffer: { id: number; datum: string; gesamtbetrag: number; kategorie: string } | null }>;
}
