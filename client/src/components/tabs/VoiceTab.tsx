import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Play, Square, Activity as Loader2, Ear } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePrescriptionContext } from "@/context/PrescriptionContext";
import { useGenerateAudio } from "@/hooks/use-prescriptions";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/hooks/use-toast";

export function VoiceTab() {
  const { parsedData } = usePrescriptionContext();
  const { mutate: generateAudio, isPending } = useGenerateAudio();
  const { toast } = useToast();
  
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  if (!parsedData) {
    return (
      <EmptyState 
        title="No Audio Available" 
        description="Please parse a prescription first to generate accessible synthesized voice output." 
      />
    );
  }

  const handleGenerate = () => {
    if (!parsedData.tts_ready_text) return;
    
    generateAudio(parsedData.tts_ready_text, {
      onSuccess: (blob) => {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        toast({ title: "Synthesis Complete", description: "Audio track is ready for playback." });
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Synthesis Error", description: err.message });
      }
    });
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10 py-6">
      <div className="text-center space-y-4 mb-10">
        <div className="inline-flex w-20 h-20 rounded-full bg-gradient-to-tr from-teal-50 to-blue-50 text-teal-600 items-center justify-center mb-2 shadow-inner border border-teal-100/50">
          <Ear className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-display font-bold text-slate-800 tracking-tight">Vocal Assistance</h2>
        <p className="text-slate-500 text-lg">Listen to clear, synthesized instructions derived directly from your clinical data.</p>
      </div>

      <Card className="glass-medical-card rounded-3xl border-0 overflow-hidden relative">
        <CardContent className="p-10 space-y-10">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-slate-100 rounded-full blur-3xl -z-10 pointer-events-none"></div>

          <div className="p-8 bg-white/60 rounded-2xl border border-slate-200/60 shadow-sm backdrop-blur-sm relative overflow-hidden">
            <div className="absolute left-0 top-0 w-1.5 h-full bg-[#0369A1]"></div>
            <h3 className="text-sm font-bold text-blue-800 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Mic className="w-4 h-4" /> Synthesized Script
            </h3>
            <p className="text-2xl text-slate-700 leading-relaxed font-semibold">
              "{parsedData.tts_ready_text}"
            </p>
          </div>

          <div className="flex flex-col items-center justify-center gap-8 pt-6">
            <AnimatePresence mode="wait">
              {!audioUrl ? (
                <motion.div
                  key="generateBtn"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                >
                  <Button 
                    size="lg" 
                    className={`rounded-2xl px-10 h-16 shadow-xl transition-all text-xl font-bold group overflow-hidden relative ${
                      isPending 
                        ? "bg-slate-100 text-teal-700 border border-teal-200 hover:bg-slate-100" 
                        : "bg-gradient-to-r from-[#0F766E] to-[#0369A1] hover:from-[#0D9488] hover:to-[#0284C7] text-white"
                    }`}
                    onClick={handleGenerate}
                    disabled={isPending}
                  >
                    {isPending ? (
                      <span className="flex items-center gap-3">
                        <Loader2 className="w-6 h-6 animate-spin text-teal-600" /> Generating Synthesis...
                      </span>
                    ) : (
                      <span className="flex items-center gap-3 group-hover:scale-105 transition-transform">
                        <Mic className="w-6 h-6" /> Generate Audio Track
                      </span>
                    )}
                  </Button>
                </motion.div>
              ) : (
                <motion.div 
                  key="playerBox"
                  initial={{ scale: 0.9, opacity: 0, y: 20 }} 
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  className="flex items-center gap-8 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 w-full max-w-lg mx-auto"
                >
                  <audio 
                    ref={audioRef} 
                    src={audioUrl} 
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                  />
                  
                  <Button 
                    size="icon"
                    className={`w-24 h-24 rounded-[2rem] shadow-xl transition-all duration-500 scale-100 hover:scale-105 ${
                      isPlaying 
                      ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/30' 
                      : 'bg-gradient-to-br from-[#0F766E] to-[#0369A1] shadow-teal-500/30'
                    }`}
                    onClick={togglePlayback}
                  >
                    {isPlaying ? (
                      <Square className="w-10 h-10 text-white fill-current" />
                    ) : (
                      <Play className="w-10 h-10 text-white fill-current ml-1" />
                    )}
                  </Button>
                  
                  <div className="flex flex-col flex-1">
                    <span className="font-bold text-slate-800 text-2xl tracking-tight mb-1">
                      {isPlaying ? "Transmitting..." : "Ready to transmit"}
                    </span>
                    <span className="text-slate-500 text-base font-medium">
                      High-fidelity medical synthesis
                    </span>
                    {isPlaying && (
                      <div className="mt-4 flex gap-1 h-3 items-end overflow-hidden">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                          <motion.div
                            key={i}
                            className="bg-teal-500 w-full rounded-t-sm"
                            animate={{ height: ["20%", "100%", "20%"] }}
                            transition={{ duration: 0.5 + (i * 0.1), repeat: Infinity, ease: "easeInOut" }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
