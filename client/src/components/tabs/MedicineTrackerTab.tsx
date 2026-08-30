import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Plus, Save, Pill, Trash2, Activity, Clock, FilePlus2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

export function MedicineTrackerTab() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [servings, setServings] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { data: medicines, isLoading } = useQuery<any[]>({
    queryKey: ["/api/medicine-images"],
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!name || !servings || !image) {
      toast({
        title: "Incomplete Initial Entry",
        description: "Clinical name, dosage instructions, and visual verification are all required.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      await apiRequest("POST", "/api/medicine-images", {
        name,
        servings,
        imageUrl: image,
      });

      toast({
        title: "Log Entry Verified",
        description: "Medication successfully tracked in patient records.",
      });

      setName("");
      setServings("");
      setImage(null);
      queryClient.invalidateQueries({ queryKey: ["/api/medicine-images"] });
    } catch (error) {
      toast({
        title: "Synchronization Error",
        description: "Failed to verify entry with medical database.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="max-w-3xl">
        <h2 className="text-3xl font-display font-bold text-slate-800 tracking-tight flex items-center gap-3">
          <Pill className="w-8 h-8 text-teal-600" /> Clinical Dosage Log
        </h2>
        <p className="text-slate-500 mt-2 text-lg">Maintain a secure visual repository of prescribed medications and administrative instructions.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* ADD NEW MEDICATION */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="glass-medical-card border-0 shadow-lg rounded-3xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full blur-3xl -z-10"></div>
            <CardHeader className="bg-white/50 border-b border-slate-100/60 pb-5">
              <CardTitle className="text-xl font-display text-slate-800 flex items-center gap-2">
                <FilePlus2 className="w-6 h-6 text-teal-600" />
                New Log Entry
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-3">
                <Label htmlFor="med-name" className="text-slate-700 font-bold">Compound / Medication Name</Label>
                <Input
                  id="med-name"
                  placeholder="e.g. Amoxicillin 500mg"
                  className="rounded-xl h-12 border-slate-200 bg-white/60 focus:bg-white transition-colors"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="servings" className="text-slate-700 font-bold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" /> Posology Rules (Dosage)
                </Label>
                <Input
                  id="servings"
                  placeholder="e.g. 1 cap P.O. b.i.d. for 7 days"
                  className="rounded-xl h-12 border-slate-200 bg-white/60 focus:bg-white transition-colors"
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <Label className="text-slate-700 font-bold">Visual Verification</Label>
                <div 
                  className={`
                    relative flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 transition-all cursor-pointer group overflow-hidden
                    ${image ? 'border-teal-500 bg-slate-900' : 'border-slate-300 bg-slate-50 hover:bg-teal-50/50 hover:border-teal-400'}
                  `}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    onChange={handleImageUpload}
                  />
                  {image ? (
                    <>
                      <img src={image} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" />
                      <div className="relative z-20 flex flex-col items-center text-white">
                        <Camera className="w-8 h-8 mb-2 drop-shadow-lg" />
                        <span className="font-bold drop-shadow-md">Tap to Retake Photo</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-full bg-teal-100/50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <Camera className="w-6 h-6 text-teal-600" />
                      </div>
                      <span className="font-semibold text-slate-700">Capture Medicine Photo</span>
                      <span className="text-xs text-slate-500 mt-1">Clear ID helps prevent dosage errors</span>
                    </>
                  )}
                </div>
              </div>

              <Button
                className={`w-full h-14 rounded-xl text-lg font-bold shadow-lg transition-all relative overflow-hidden group ${
                  isSaving 
                    ? "bg-slate-100 text-teal-700 border border-teal-200" 
                    : "bg-gradient-to-r from-[#0F766E] to-[#0369A1] hover:from-[#0D9488] hover:to-[#0284C7] text-white shadow-teal-500/25"
                }`}
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <span className="flex items-center gap-3">
                    <Activity className="w-5 h-5 animate-spin text-teal-600" /> Logging Entry...
                  </span>
                ) : (
                  <span className="flex items-center gap-2 group-hover:scale-105 transition-transform">
                    <Save className="w-5 h-5" /> Append to Records
                  </span>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* MEDICATION LOG LIST */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-xl flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" /> Active Prescriptory
            </h3>
            <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-100">
              {medicines?.length || 0} Entries
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse flex border border-slate-200/50">
                  <div className="w-32 bg-slate-200 rounded-l-2xl"></div>
                  <div className="p-4 flex-1 space-y-3">
                    <div className="h-6 w-1/2 bg-slate-200 rounded-full"></div>
                    <div className="h-4 w-3/4 bg-slate-200 rounded-full"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : medicines?.length === 0 ? (
            <div className="text-center py-16 bg-white/50 rounded-3xl border-2 border-slate-200 border-dashed backdrop-blur-sm">
              <div className="inline-flex w-16 h-16 rounded-full bg-slate-100 text-slate-400 items-center justify-center mb-4">
                <Pill className="w-8 h-8" />
              </div>
              <h4 className="text-xl font-bold text-slate-700 mb-1">Prescriptory Empty</h4>
              <p className="text-slate-500">Add medications using the form to build your digital clinical log.</p>
            </div>
          ) : (
            <AnimatePresence>
              <div className="grid gap-4">
                {medicines?.map((med: any) => (
                  <motion.div
                    key={med.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <Card className="glass-medical-card border-slate-200/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex rounded-2xl group">
                      <div className="w-32 sm:w-40 flex-shrink-0 relative bg-slate-100">
                        <img src={med.imageUrl} alt={med.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/10 group-hover:to-transparent transition-colors"></div>
                      </div>
                      <CardContent className="p-5 flex flex-col justify-center flex-1 relative bg-white/60">
                        <h4 className="font-bold text-slate-900 text-lg pr-10 mb-1">{med.name}</h4>
                        <div className="flex items-start gap-2 text-slate-600 mb-3 bg-slate-50/80 p-2 rounded-lg border border-slate-100/50 w-max">
                          <Clock className="w-4 h-4 mt-0.5 text-blue-500" />
                          <p className="text-sm font-medium">{med.servings}</p>
                        </div>
                        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                          Logged: {new Date(med.createdAt).toLocaleDateString()}
                        </p>
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-4 right-4 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors h-10 w-10"
                          onClick={async () => {
                            try {
                              await apiRequest("DELETE", `/api/medicine-images/${med.id}`);
                              queryClient.invalidateQueries({ queryKey: ["/api/medicine-images"] });
                              toast({ title: "Entry Removed", description: "Record struck from prescriptory." });
                            } catch (e) {
                              toast({ title: "Operation Error", description: "Failed to excise record from database.", variant: "destructive" });
                            }
                          }}
                        >
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
