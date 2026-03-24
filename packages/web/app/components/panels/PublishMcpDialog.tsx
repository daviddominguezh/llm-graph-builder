'use client';

import { MCP_LIBRARY_CATEGORIES } from '@daviddh/graph-types';
import { AlertTriangle, Camera, Server } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { type ChangeEvent, useRef, useState } from 'react';
import { toast } from 'sonner';

import { publishMcpAction } from '@/app/actions/mcpLibrary';
import { extractVariableNames } from '@/app/lib/resolveVariables';
import type { McpServerConfig } from '@/app/schemas/graph.schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface PublishMcpDialogProps {
  server: McpServerConfig;
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished: () => void;
}

interface PublishFormState {
  description: string;
  category: string;
  imageFile: File | null;
}

function extractTransportConfig(transport: McpServerConfig['transport']): Record<string, unknown> {
  const config: Record<string, unknown> = { ...transport };
  delete config['type'];
  return config;
}

function PublishWarningBanner() {
  const t = useTranslations('mcpLibrary');

  return (
    <div className="flex gap-2 rounded-md bg-orange-50 p-3 text-orange-800 dark:bg-orange-950 dark:text-orange-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <p className="text-xs">{t('publishWarning')}</p>
    </div>
  );
}

interface PublishFormFieldsProps {
  state: PublishFormState;
  onDescriptionChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onImageChange: (f: File | null) => void;
}

function ImagePicker({ imageFile, onImageChange }: { imageFile: File | null; onImageChange: (f: File | null) => void }) {
  const t = useTranslations('mcpLibrary');
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrl = imageFile !== null ? URL.createObjectURL(imageFile) : null;

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onImageChange(e.target.files?.[0] ?? null);
  }

  return (
    <div className="flex flex-col gap-1">
      <Label>{t('image')}</Label>
      <Button variant="ghost" type="button" onClick={() => fileRef.current?.click()} className="group relative size-16 cursor-pointer rounded-md p-0">
        {previewUrl !== null ? (
          <Image src={previewUrl} alt="MCP" width={64} height={64} className="size-16 rounded-md object-cover border" unoptimized />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-md bg-muted">
            <Server className="size-6 text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/0 transition-colors group-hover:bg-black/40">
          <Camera className="size-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </Button>
      <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={handleChange} />
    </div>
  );
}

function PublishFormFields({ state, onDescriptionChange, onCategoryChange, onImageChange }: PublishFormFieldsProps) {
  const t = useTranslations('mcpLibrary');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label>{t('description')}</Label>
        <Textarea
          value={state.description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder={t('descriptionPlaceholder')}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label>{t('category')}</Label>
        <Select value={state.category} onValueChange={(v) => onCategoryChange(v ?? '')}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MCP_LIBRARY_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ImagePicker imageFile={state.imageFile} onImageChange={onImageChange} />
    </div>
  );
}

function VariablePreview({ variables }: { variables: string[] }) {
  const t = useTranslations('mcpLibrary');

  return (
    <div className="flex flex-col gap-1">
      <Label>{t('detectedVariables')}</Label>
      {variables.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('noVariables')}</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {variables.map((v) => (
            <Badge key={v} variant="outline">
              {v}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function buildImageFormData(imageFile: File | null): FormData | undefined {
  if (imageFile === null) return undefined;
  const fd = new FormData();
  fd.append('image', imageFile);
  return fd;
}

interface PublishDialogBodyProps {
  server: McpServerConfig;
  orgId: string;
  onOpenChange: (open: boolean) => void;
  onPublished: () => void;
}

function PublishDialogBody({ server, orgId, onOpenChange, onPublished }: PublishDialogBodyProps) {
  const t = useTranslations('mcpLibrary');
  const variables = extractVariableNames(server.transport);
  const [loading, setLoading] = useState(false);
  const [formState, setFormState] = useState<PublishFormState>({
    description: '',
    category: '',
    imageFile: null,
  });

  async function handlePublish() {
    if (formState.description.trim() === '') {
      toast.error(t('descriptionRequired'));
      return;
    }
    if (formState.category === '') {
      toast.error(t('categoryRequired'));
      return;
    }

    setLoading(true);

    const { error } = await publishMcpAction(
      {
        org_id: orgId,
        name: server.name,
        description: formState.description.trim(),
        category: formState.category,
        transport_type: server.transport.type,
        transport_config: extractTransportConfig(server.transport),
        variables: variables.map((name) => ({ name })),
      },
      buildImageFormData(formState.imageFile)
    );

    setLoading(false);

    if (error !== null) {
      toast.error(t('publishError'));
      return;
    }

    toast.success(t('publishSuccess'));
    onOpenChange(false);
    onPublished();
  }

  return (
    <div className="flex flex-col gap-4">
      <PublishWarningBanner />
      <PublishFormFields
        state={formState}
        onDescriptionChange={(v) => setFormState((s) => ({ ...s, description: v }))}
        onCategoryChange={(v) => setFormState((s) => ({ ...s, category: v }))}
        onImageChange={(f) => setFormState((s) => ({ ...s, imageFile: f }))}
      />
      <VariablePreview variables={variables} />
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t('publishCancel')}
        </Button>
        <Button onClick={handlePublish} disabled={loading}>
          {t('publishConfirm')}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function PublishMcpDialog({ server, orgId, open, onOpenChange, onPublished }: PublishMcpDialogProps) {
  const t = useTranslations('mcpLibrary');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('publishTitle')}</DialogTitle>
        </DialogHeader>
        <PublishDialogBody server={server} orgId={orgId} onOpenChange={onOpenChange} onPublished={onPublished} />
      </DialogContent>
    </Dialog>
  );
}
