import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getMyAccount, saveMyAccount } from "@/lib/interview.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
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
  }, [account.data]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          fullName: form.fullName,
          phone: form.phone || null,
          headline: form.headline || null,
          targetRole: form.targetRole || null,
          yearsExperience: Number(form.yearsExperience) || 0,
          location: form.location || null,
          resumeText: form.resumeText || null,
        },
      }),
    onSuccess: () => {
      toast.success("Profile saved");
      void queryClient.invalidateQueries({ queryKey: ["account"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save your profile"),
  });

  return (
    <AppShell
      title="Candidate profile"
      subtitle="Used to personalise question plans and interpret your answers."
      isAdmin={account.data?.isAdmin ?? false}
    >
      <div className="grid gap-6 lg:grid-cols-2">
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
                placeholder="Frontend engineer focused on design systems"
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
                  onChange={(e) =>
                    setForm({ ...form, yearsExperience: Number(e.target.value) })
                  }
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resume text</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="resume-file">Upload a plain-text resume (optional)</Label>
              <Input
                id="resume-file"
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  setForm((prev) => ({ ...prev, resumeText: text.slice(0, 20000) }));
                  toast.success(`Loaded ${file.name} — review it, then save`);
                  e.target.value = "";
                }}
              />
            </div>
            <Textarea
              rows={14}
              placeholder="Paste your resume here — the interviewer uses it to ground questions in your real experience."
              value={form.resumeText}
              onChange={(e) => setForm({ ...form, resumeText: e.target.value })}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save profile
              </Button>
              {form.resumeText && (
                <Button
                  variant="outline"
                  onClick={() => setForm({ ...form, resumeText: "" })}
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
