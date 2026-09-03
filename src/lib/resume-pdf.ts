/**
 * Browser-side PDF text extraction. Loaded lazily so pdf.js never enters the
 * SSR bundle.
 */
export async function extractPdfText(file: File, maxChars = 20000): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  let text = "";
  for (let page = 1; page <= doc.numPages; page += 1) {
    const content = await (await doc.getPage(page)).getTextContent();
    text += content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    text += "\n\n";
    if (text.length >= maxChars) break;
  }
  return text.trim().slice(0, maxChars);
}
