import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, Image as ImageIcon, CheckCircle2, Languages, HeartPulse, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePrescriptionContext } from "@/context/PrescriptionContext";
import { useParsePrescription } from "@/hooks/use-prescriptions";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/EmptyState";

export function ParserTab() {
  const { image, setImage, language, setLanguage, parsedData, setParsedData } = usePrescriptionContext();
  const { mutate: parsePrescription, isPending } = useParsePrescription();
  const { toast } = useToast();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, [setImage]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png'] },
    maxFiles: 1
  });

  const handleParse = () => {
    if (!image) return;
    
    parsePrescription(
      { image, language },
      {
        onSuccess: (data) => {
          setParsedData(data);
          toast({
            title: "Analysis Complete",
            description: "Diagnostic interpretation successful. Data extracted.",
          });
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Analysis Failed",
            description: err.message,
          });
        }
      }
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* LEFT COLUMN - UPLOAD & CONTROLS */}
      <div className="lg:col-span-4 space-y-6">
        <Card className="glass-medical-card rounded-2xl border-0 overflow-hidden relative">
          {isPending && <div className="ekg-line z-50"></div>}
          <CardHeader className="pb-4 border-b border-slate-100 bg-white/50">
            <CardTitle className="text-lg font-display text-slate-800 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-teal-600" />
              Document Upload
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div 
              {...getRootProps()} 
              className={`
                relative overflow-hidden border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300
                ${isDragActive ? 'border-teal-400 bg-teal-50/50 scale-[1.02]' : 'border-slate-300 hover:border-teal-400 hover:bg-slate-50/50'}
                ${image ? 'p-2 border-transparent bg-slate-50' : ''}
              `}
            >
              <input {...getInputProps()} />
              
              {image ? (
                <div className="relative rounded-xl overflow-hidden group shadow-sm border border-slate-200">
                  <img src={image} alt="Prescription" className="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-sm">
                    <p className="text-white font-medium flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full border border-white/30">
                      <UploadCloud className="w-4 h-4" /> Replace Target
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-teal-50 to-blue-50 text-teal-600 flex items-center justify-center shadow-inner border border-teal-100/50">
                    <UploadCloud className="w-8 h-8 opacity-80" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700 text-lg">Drop prescription here</p>
                    <p className="text-sm text-slate-500 mt-1">Accepts PNG, JPG scans</p>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Languages className="w-4 h-4 text-blue-600" /> Target Translation
              </label>
              <Select value={language} onValueChange={(v: any) => setLanguage(v)}>
                <SelectTrigger className="w-full h-12 rounded-xl bg-white border-slate-200 shadow-sm focus:ring-teal-500">
                  <SelectValue placeholder="Select Language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hindi">Hindi</SelectItem>
                  <SelectItem value="telugu">Telugu</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              className={`w-full h-14 rounded-xl text-lg font-bold shadow-lg transition-all duration-300 relative overflow-hidden group ${
                isPending 
                  ? "bg-slate-100 hover:bg-slate-100 text-teal-600 border border-teal-200 shadow-teal-500/10" 
                  : "bg-gradient-to-r from-[#0F766E] to-[#0369A1] hover:from-[#0D9488] hover:to-[#0284C7] text-white shadow-teal-500/25"
              }`}
              onClick={handleParse}
              disabled={!image || isPending}
            >
              {isPending ? (
                <span className="flex items-center gap-3">
                  <Activity className="w-6 h-6 animate-heartbeat text-teal-500" /> 
                  Running Diagnostics...
                </span>
              ) : (
                <span className="flex items-center gap-2 group-hover:scale-105 transition-transform">
                  <HeartPulse className="w-5 h-5 mr-1" /> Initiate Analysis
                </span>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* RIGHT COLUMN - RESULTS */}
      <div className="lg:col-span-8">
        <AnimatePresence mode="wait">
          {!parsedData ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="h-full"
            >
              <EmptyState 
                title="Awaiting Input" 
                description="Upload a medical document to extract dosages, instructions, and safety warnings." 
              />
            </motion.div>
          ) : (
            <motion.div 
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6 h-full"
            >
              <Card className="glass-medical-card h-full rounded-2xl border-0 overflow-hidden flex flex-col">
                <CardHeader className="bg-gradient-to-r from-teal-50/50 to-blue-50/50 border-b border-teal-100/50 pb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-500 text-white flex items-center justify-center shadow-md shadow-teal-500/20">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-display text-slate-800">Extracted Medicines</CardTitle>
                      <p className="text-sm text-slate-500 font-medium">Verified diagnostic extraction</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50/80">
                        <TableRow className="border-slate-200 hover:bg-transparent">
                          <TableHead className="font-bold text-slate-700 h-12">Compound</TableHead>
                          <TableHead className="font-bold text-slate-700 h-12">Dose</TableHead>
                          <TableHead className="font-bold text-slate-700 h-12">Frequency</TableHead>
                          <TableHead className="font-bold text-slate-700 h-12">Duration</TableHead>
                          <TableHead className="font-bold text-slate-700 h-12 min-w-[200px]">Clinical Instructions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedData.parsed_medicines.map((med, idx) => (
                          <TableRow key={idx} className="hover:bg-teal-50/30 transition-colors border-slate-100">
                            <TableCell className="font-bold text-slate-900">{med.medicine_name}</TableCell>
                            <TableCell className="text-slate-600 font-medium">{med.strength}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                                {med.dosage_frequency}
                              </span>
                            </TableCell>
                            <TableCell className="text-slate-600 font-medium">{med.duration}</TableCell>
                            <TableCell className="text-slate-600 leading-relaxed">{med.instructions}</TableCell>
                          </TableRow>
                        ))}
                        {parsedData.parsed_medicines.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                              <div className="flex flex-col items-center justify-center gap-2">
                                <Activity className="w-8 h-8 text-slate-300" />
                                <span>No recognizable medical compounds detected.</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
