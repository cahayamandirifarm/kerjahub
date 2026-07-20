"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/AuthContext";

interface ChatUnreadState {
  unreadChatCount: number;
  refreshUnreadChat: () => Promise<void>;
}

const ChatUnreadContext = createContext<ChatUnreadState>({
  unreadChatCount: 0,
  refreshUnreadChat: async () => {}
});

export function ChatUnreadProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const supabase = createClient();

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.rpc("my_unread_chat_count");
    setUnreadChatCount(typeof data === "number" ? data : Number(data) || 0);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setUnreadChatCount(0);
      return;
    }
    refresh();

    // pesan baru di percakapan manapun bisa mengubah unread count kita —
    // filter di client karena postgres_changes tidak bisa filter by "in (list)".
    const channel = supabase
      .channel(`chat-unread-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "message_reads" }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members" }, () => refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <ChatUnreadContext.Provider value={{ unreadChatCount, refreshUnreadChat: refresh }}>
      {children}
    </ChatUnreadContext.Provider>
  );
}

export function useChatUnread() {
  return useContext(ChatUnreadContext);
}
