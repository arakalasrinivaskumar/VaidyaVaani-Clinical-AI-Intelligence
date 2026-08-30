import { FileSearch } from "lucide-react";
import { motion } from "framer-motion";

interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-24 px-4 text-center bg-white/60 backdrop-blur-sm rounded-3xl border border-slate-200/60 shadow-sm"
    >
      <div className="w-20 h-20 bg-gradient-to-tr from-teal-50 to-blue-50 rounded-2xl flex items-center justify-center mb-6 text-teal-600 shadow-inner border border-teal-100/50">
        <FileSearch className="w-10 h-10" />
      </div>
      <h3 className="text-2xl font-bold text-slate-800 mb-3 font-display tracking-tight">{title}</h3>
      <p className="text-slate-500 max-w-md text-lg leading-relaxed">{description}</p>
    </motion.div>
  );
}
