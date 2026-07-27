"use client";
import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { createClient } from "@/lib/supabase/client";
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  List,
  ListOrdered,
  Quote,
  Heading2,
  Heading3,
  LinkIcon,
  ImageIcon,
  Youtube as YoutubeIcon,
  TableIcon,
  Undo,
  Redo
} from "lucide-react";

// Rich text editor buat kolom "Content" landing page SEO. Upload gambar
// langsung ke bucket storage `seo-og-images` (bucket publik yang sama
// dipakai OG image -- dibuat di migration 0085) supaya tidak perlu bucket
// baru lagi, lalu hasil <img> di-embed langsung ke HTML content.
export default function RichTextEditor({
  value,
  onChange
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Youtube.configure({ nocookie: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[240px] px-3 py-3 focus:outline-none"
      }
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    immediatelyRender: false
  });

  // Sinkronkan kalau `value` berubah dari luar (mis. saat form load data
  // existing landing page pertama kali) tanpa bikin editor infinite-loop
  // nulis ulang tiap ketikan.
  useEffect(() => {
    if (editor && value !== editor.getHTML() && document.activeElement?.closest(".rte-wrapper") === null) {
      editor.commands.setContent(value || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!editor) return <div className="input min-h-[280px] animate-pulse bg-ink/5" />;

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor) return;
    const supabase = createClient();
    const path = `content/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("seo-og-images").upload(path, file);
    if (error) return;
    const { data } = supabase.storage.from("seo-og-images").getPublicUrl(path);
    editor.chain().focus().setImage({ src: data.publicUrl }).run();
  }

  function addLink() {
    const url = window.prompt("URL link:");
    if (url) editor?.chain().focus().setLink({ href: url }).run();
  }

  function addYoutube() {
    const url = window.prompt("URL video YouTube:");
    if (url) editor?.commands.setYoutubeVideo({ src: url });
  }

  function addTable() {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  const ToolbarBtn = ({
    active,
    onClick,
    children,
    label
  }: {
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
    label: string;
  }) => (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`p-1.5 rounded-md ${active ? "bg-turquoise-light text-turquoise-dark" : "text-ink/50 hover:bg-ink/5"}`}
    >
      {children}
    </button>
  );

  return (
    <div className="rte-wrapper border border-line rounded-xl overflow-hidden bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1.5 bg-paper">
        <ToolbarBtn label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <BoldIcon size={15} />
        </ToolbarBtn>
        <ToolbarBtn label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <ItalicIcon size={15} />
        </ToolbarBtn>
        <ToolbarBtn
          label="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={15} />
        </ToolbarBtn>
        <ToolbarBtn
          label="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={15} />
        </ToolbarBtn>
        <ToolbarBtn label="Bullet List" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={15} />
        </ToolbarBtn>
        <ToolbarBtn
          label="Numbered List"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={15} />
        </ToolbarBtn>
        <ToolbarBtn label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote size={15} />
        </ToolbarBtn>
        <ToolbarBtn label="Link" active={editor.isActive("link")} onClick={addLink}>
          <LinkIcon size={15} />
        </ToolbarBtn>
        <label className="p-1.5 rounded-md text-ink/50 hover:bg-ink/5 cursor-pointer" title="Sisipkan Gambar">
          <ImageIcon size={15} />
          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </label>
        <ToolbarBtn label="YouTube" onClick={addYoutube}>
          <YoutubeIcon size={15} />
        </ToolbarBtn>
        <ToolbarBtn label="Tabel" onClick={addTable}>
          <TableIcon size={15} />
        </ToolbarBtn>
        <div className="w-px h-4 bg-line mx-1" />
        <ToolbarBtn label="Undo" onClick={() => editor.chain().focus().undo().run()}>
          <Undo size={15} />
        </ToolbarBtn>
        <ToolbarBtn label="Redo" onClick={() => editor.chain().focus().redo().run()}>
          <Redo size={15} />
        </ToolbarBtn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
