"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import { Send } from "lucide-react";

export default function ChatPage({ params }: { params: { conversationId: string } }) {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/login?next=/chat/${params.conversationId}`);
        return;
      }
      setUserId(user.id);

      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", params.conversationId)
        .order("created_at", { ascending: true });
      setMessages(data || []);

      const channel = supabase
        .channel(`conversation-${params.conversationId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${params.conversationId}` },
          (payload) => setMessages((prev) => [...prev, payload.new])
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !userId) return;
    const content = text.trim();
    setText("");
    await supabase.from("messages").insert({
      conversation_id: params.conversationId,
      sender_id: userId,
      content
    });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-lg w-full mx-auto px-4 py-4 flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-2 pb-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                m.sender_id === userId ? "bg-forest text-paper ml-auto" : "bg-white border border-line"
              }`}
            >
              {m.content}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={sendMessage} className="flex gap-2 sticky bottom-4">
          <input
            className="input flex-1"
            placeholder="Tulis pesan..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn-primary !px-4 !py-3">
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
