export function SpeechBubble(
  { text, variant }: { text: string; variant: 'greeting' | 'proactive' }
) {
  return (
    <div className={`speech-bubble ${variant}`} role="status">
      {text}
    </div>
  );
}
