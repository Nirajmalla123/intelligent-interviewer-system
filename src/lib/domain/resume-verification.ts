/** Client-safe check that the candidate's profile name appears in their resume text. */
const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export type ResumeCheck =
  | { verified: true }
  | { verified: false; reason: string };

export function verifyResumeName(fullName: string | null | undefined, resumeText: string | null | undefined): ResumeCheck {
  if (!fullName || !fullName.trim()) {
    return { verified: false, reason: "Add your full name in Profile before starting." };
  }
  if (!resumeText || !resumeText.trim()) {
    return { verified: false, reason: "Upload your PDF resume in Profile before starting." };
  }
  const text = ` ${normalise(resumeText)} `;
  const compact = text.replace(/ /g, "");
  const name = normalise(fullName);
  const parts = name.split(" ").filter((p) => p.length >= 2);
  if (parts.length === 0) {
    return { verified: false, reason: "Your profile name is not valid." };
  }
  const allPartsFound = parts.every((p) => text.includes(` ${p} `));
  const joinedFound = compact.includes(parts.join(""));
  if (allPartsFound || joinedFound) return { verified: true };
  return {
    verified: false,
    reason: `The name "${fullName.trim()}" was not found in your resume. Make sure your profile name matches the name on your resume.`,
  };
}
