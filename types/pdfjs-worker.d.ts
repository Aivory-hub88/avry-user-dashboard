// pdfjs-dist ships no types for its worker entry; lib/roomFileText.ts only
// hands the module to pdfjs as globalThis.pdfjsWorker (fake-worker mode).
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown
}
