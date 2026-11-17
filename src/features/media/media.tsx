import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Surface, Text } from "@cloudflare/kumo";
import { Upload, Trash } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import type { MediaAsset } from "@shared/types";

export function MediaPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ["media"],
    queryFn: () => api.get<{ items: MediaAsset[]; nextCursor: string | null }>("/api/media?limit=100"),
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.upload<MediaAsset>("/api/media", form);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/media/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media"] }),
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((f) => upload.mutate(f));
    e.target.value = "";
  };

  const assets = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Media library"
        description="Assets stored in R2 and reusable across posts."
        actions={
          <Button variant="primary" onClick={() => inputRef.current?.click()} loading={upload.isPending}>
            <Upload size={15} /> Upload
          </Button>
        }
      />
      <input ref={inputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={onPick} />
      <div className="px-6 pb-8">
        <Surface className="overflow-hidden rounded-lg">
          {assets.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Text variant="secondary">No media yet. Upload images or videos to get started.</Text>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
              {assets.map((a) => (
                <div key={a.id} className="group overflow-hidden rounded-lg border border-kumo-line">
                  {a.mimeType.startsWith("image/") ? (
                    <img src={a.url} alt={a.filename} className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center bg-kumo-recessed">
                      <Text variant="secondary" DANGEROUS_className="text-[14px]">video</Text>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <Text variant="secondary" DANGEROUS_className="truncate text-[14px]">{a.filename}</Text>
                    <Button variant="secondary" size="sm" shape="square" onClick={() => remove.mutate(a.id)} aria-label="Delete asset"><Trash size={13} /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
}
