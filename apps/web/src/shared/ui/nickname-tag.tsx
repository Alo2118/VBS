import { cn } from "./cn";

/**
 * Mostra il soprannome tra virgolette accanto al nome.
 * Serve a distinguere i soci omonimi senza esporre altri dati personali.
 */
export const NicknameTag = ({
  nickname,
  className
}: {
  nickname?: string;
  className?: string;
}) => (nickname ? <span className={cn("text-muted", className)}>«{nickname}»</span> : null);
