import { motion } from "framer-motion";
import { Stethoscope, Languages, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePrescriptionContext } from "@/context/PrescriptionContext";
import { EmptyState } from "@/components/EmptyState";

export function ExplanationTab() {
  const { parsedData } = usePrescriptionContext();

  if (!parsedData) {
    return (
      <EmptyState 
        title="No Clinical Data" 
        description="Awaiting prescription analysis to provide multilingual explanations and safety protocols." 
      />
    );
  }

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, scale: 0.95 },
    show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 100 } }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
    >
      <motion.div variants={item}>
        <Card className="h-full glass-medical-card rounded-2xl border-0 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#0369A1] group-hover:w-2 transition-all"></div>
          <CardHeader className="pb-3 px-6 pt-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-inner group-hover:scale-110 transition-transform">
                <Stethoscope className="w-6 h-6" />
              </div>
              <CardTitle className="text-xl font-display text-slate-800">Clinical Overview</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <p className="text-slate-600 leading-relaxed text-lg">
              {parsedData.simplified_explanation || "No explanation provided."}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={item}>
        <Card className="h-full glass-medical-card rounded-2xl border-0 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#0F766E] group-hover:w-2 transition-all"></div>
          <CardHeader className="pb-3 px-6 pt-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100 shadow-inner group-hover:rotate-12 transition-transform">
                <Languages className="w-6 h-6" />
              </div>
              <CardTitle className="text-xl font-display text-slate-800">Direct Translation</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="p-4 bg-teal-50/50 rounded-xl border border-teal-100/50">
              <p className="text-teal-900 leading-relaxed font-semibold text-lg">
                {parsedData.vernacular_translation || "No translation provided."}
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={item} className="md:col-span-2 lg:col-span-1">
        <Card className="h-full rounded-2xl border border-red-200/50 relative overflow-hidden group bg-white/95 backdrop-blur-xl shadow-[0_8px_30px_rgb(225,29,72,0.06)] hover:shadow-[0_8px_30px_rgb(225,29,72,0.15)] transition-all">
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl -z-10"></div>
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#E11D48] group-hover:bg-[#BE123C] transition-colors"></div>
          <CardHeader className="pb-3 px-6 pt-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center border border-red-100 shadow-inner animate-pulse-ring">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <CardTitle className="text-xl font-display text-slate-800">Safety Protocols</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="p-4 bg-red-50/50 rounded-xl border border-red-100/50">
              <p className="text-red-900 leading-relaxed font-bold text-lg">
                {parsedData.safety_notes || "No critical safety notes provided. Please consult with your physician."}
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
