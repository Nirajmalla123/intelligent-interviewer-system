import { AppShell } from "@/components/layout/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { initialsOf, signedAvatarUrl } from "@/lib/avatar";
import { getMyAccount, saveMyAccount } from "@/lib/interview.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Candidate profile — Signal Room" },
      {
        name: "description",
        content:
          "Keep your experience and resume up to date so interview questions match your background.",
      },
      { property: "og:title", content: "Candidate profile — Signal Room" },
      {
        property: "og:description",
        content: "Update your experience and resume to tailor AI interview questions.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const queryClient = useQueryClient();
  const fetchAccount = useServerFn(getMyAccount);
  const save = useServerFn(saveMyAccount);
  const account = useQuery({ queryKey: ["account"], queryFn: () => fetchAccount({}) });

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    headline: "",
    targetRole: "",
    yearsExperience: 0,
    location: "",
    resumeText: "",
  });
  const [resumeMeta, setResumeMeta] = useState<{ fileName: string | null; path: string | null }>({
    fileName: null,
    path: null,
  });
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);

  useEffect(() => {
    const data = account.data;
    if (!data) return;
    setForm({
      fullName: data.profile?.fullName ?? "",
      phone: data.profile?.phone ?? "",
      headline: data.profile?.headline ?? "",
      targetRole: data.profile?.targetRole ?? "",
      yearsExperience: data.profile?.yearsExperience ?? 0,
      location: data.profile?.location ?? "",
      resumeText: data.resumeText ?? "",
    });
    setResumeMeta({ fileName: data.resumeFileName ?? null, path: null });
    setAvatarPath(data.avatarUrl ?? null);
  }, [account.data]);

  useEffect(() => {
    let active = true;
    void signedAvatarUrl(avatarPath).then((url) => {
      if (active) setAvatarUrl(url);
    });
    return () => {
      active = false;
    };
  }, [avatarPath]);

  const mutation = useMutation({
    mutationFn: (overrides?: { avatarUrl?: string | null }) =>
      save({
        data: {
          fullName: form.fullName,
          phone: form.phone || null,
          headline: form.headline || null,
          targetRole: form.targetRole || null,
          yearsExperience: Number(form.yearsExperience) || 0,
          location: form.location || null,
          resumeText: form.resumeText,
          resumeFileName: resumeMeta.fileName,
          resumePath: resumeMeta.path,
          avatarUrl: overrides?.avatarUrl ?? avatarPath,
        },
      }),
    onSuccess: () => {
      toast.success("Profile saved");
      void queryClient.invalidateQueries({ queryKey: ["account"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save your profile"),
  });

  async function handleAvatar(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file (PNG or JPG)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Profile photos must be smaller than 5 MB");
      return;
    }
    setAvatarBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Your session expired — sign in again");
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${userId}/avatar-${Date.now()}.${extension}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      setAvatarPath(path);
      await mutation.mutateAsync({ avatarUrl: path });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Photo upload failed");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleResume(file: File) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast.error("Resumes must be PDF files");
      return;
    }
    setResumeBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Your session expired — sign in again");
      const { extractPdfText } = await import("@/lib/resume-pdf");
      const text = await extractPdfText(file);
      if (!text) throw new Error("No selectable text found in that PDF");
      const path = `${userId}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await supabase.storage
        .from("resumes")
        .upload(path, file, { upsert: true, contentType: "application/pdf" });
      if (error) throw error;
      setResumeMeta({ fileName: file.name, path });
      setForm((prev) => ({ ...prev, resumeText: text }));
      toast.success(`Read ${file.name} — review the text, then save`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that PDF");
    } finally {
      setResumeBusy(false);
    }
  }

  return (
    <AppShell
      title="Candidate profile"
      subtitle="Used to personalise question plans and interpret your answers."
      isAdmin={account.data?.isAdmin ?? false}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile photo</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-5">
            <Avatar className="size-20">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={form.fullName || "Profile photo"} />}
              <AvatarFallback className="text-lg">
                {initialsOf(form.fullName, account.data?.profile?.email)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <Label htmlFor="avatar-file" className="text-sm">
                PNG or JPG, up to 5 MB
              </Label>
              <Input
                id="avatar-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={avatarBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleAvatar(file);
                }}
              />
              {avatarBusy && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Uploading photo…
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Row label="Full name">
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </Row>
            <Row label="Headline">
              <Input
                value={form.headline}
                onChange={(e) => setForm({ ...form, headline: e.target.value })}
              />
            </Row>
            <div className="grid gap-4 sm:grid-cols-2">
              <Row label="Target role">
                <Input
                  value={form.targetRole}
                  onChange={(e) => setForm({ ...form, targetRole: e.target.value })}
                />
              </Row>
              <Row label="Years of experience">
                <Input
                  type="number"
                  min={0}
                  max={60}
                  value={form.yearsExperience}
                  onChange={(e) => setForm({ ...form, yearsExperience: Number(e.target.value) })}
                />
              </Row>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Row label="Phone">
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </Row>
              <Row label="Location">
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </Row>
            </div>
            <Button onClick={() => mutation.mutate(undefined)} disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save changes
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Resume (PDF)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="resume-file">Upload your resume as a PDF</Label>
              <Input
                id="resume-file"
                type="file"
                accept="application/pdf,.pdf"
                disabled={resumeBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleResume(file);
                }}
              />
              <p className="text-xs text-muted-foreground">
                {resumeBusy ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-3 animate-spin" /> Reading your PDF…
                  </span>
                ) : resumeMeta.fileName ? (
                  <span className="flex items-center gap-2">
                    <Upload className="size-3" /> {resumeMeta.fileName}
                  </span>
                ) : (
                  "Text-based PDFs only — scanned images cannot be read."
                )}
              </p>
            </div>
            <Textarea
              rows={12}
              value={form.resumeText}
              onChange={(e) => setForm({ ...form, resumeText: e.target.value })}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => mutation.mutate(undefined)} disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save profile
              </Button>
              {form.resumeText && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setForm({ ...form, resumeText: "" });
                    setResumeMeta({ fileName: null, path: null });
                  }}
                  disabled={mutation.isPending}
                >
                  Clear resume
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
