import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Surface, Table, Text } from "@cloudflare/kumo";
import { DownloadSimple, Plus, Trash } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Modal, ModalFooter } from "@/components/modal";
import type { Contact } from "@shared/types";

export function ContactsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", username: "", phone: "" });

  const { data } = useQuery({
    queryKey: ["contacts", search, tag],
    queryFn: () => api.get<{ items: Contact[]; nextCursor: string | null }>(`/api/contacts?search=${encodeURIComponent(search)}&tag=${encodeURIComponent(tag)}&limit=100`),
  });

  const create = useMutation({
    mutationFn: () => api.post("/api/contacts", form),
    onSuccess: () => { setModalOpen(false); setForm({ name: "", email: "", username: "", phone: "" }); queryClient.invalidateQueries({ queryKey: ["contacts"] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/contacts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts"] }),
  });

  const exportCsv = async () => {
    const csv = await api.get<string>("/api/contacts/export");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const contacts = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="Your audience across every channel."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv}><DownloadSimple size={15} /> Export CSV</Button>
            <Button variant="primary" onClick={() => setModalOpen(true)}><Plus size={15} /> Add contact</Button>
          </>
        }
      />
      <div className="px-6 pb-8">
        <div className="mb-3 flex gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or username…" />
          <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Filter by tag" />
        </div>
        <Surface className="overflow-hidden rounded-lg">
          <Table>
            <thead>
              <tr className="text-left text-[14px] text-kumo-subtle">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Username</th>
                <th className="px-4 py-2.5 font-medium">Tags</th>
                <th className="px-4 py-2.5 font-medium">Consent</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center"><Text variant="secondary">No contacts found.</Text></td></tr>
              ) : (
                contacts.map((c) => (
                  <tr key={c.id} className="border-t border-kumo-line text-[14px]">
                    <td className="px-4 py-2.5">{c.name ?? "—"}</td>
                    <td className="px-4 py-2.5">{c.email ?? "—"}</td>
                    <td className="px-4 py-2.5">{c.username ?? "—"}</td>
                    <td className="px-4 py-2.5">{c.tags.length ? c.tags.join(", ") : "—"}</td>
                    <td className="px-4 py-2.5">{c.consent}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="secondary" size="sm" shape="square" onClick={() => remove.mutate(c.id)} aria-label="Delete contact"><Trash size={14} /></Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Surface>
      </div>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Add contact"
        description="Create a contact in your audience."
        footer={<ModalFooter onClose={() => setModalOpen(false)} onSubmit={() => create.mutate()} submitLabel="Create" loading={create.isPending} />}
      >
        <div className="grid gap-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
