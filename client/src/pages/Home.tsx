import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ParserTab } from "@/components/tabs/ParserTab";
import { ExplanationTab } from "@/components/tabs/ExplanationTab";
import { VoiceTab } from "@/components/tabs/VoiceTab";
import { MedicineTrackerTab } from "@/components/tabs/MedicineTrackerTab";
import { PrescriptionProvider } from "@/context/PrescriptionContext";
import { Activity, ClipboardList, Globe2, Volume2, Pill, Cross } from "lucide-react";

export default function Home() {
  return (
    <PrescriptionProvider>
      <div className="min-h-screen bg-slate-50/80 pb-20 relative overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-[#E0F2FE]/50 to-transparent -z-10 pointer-events-none"></div>
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-teal-200/20 rounded-full blur-3xl -z-10"></div>
        <div className="absolute top-20 -left-20 w-72 h-72 bg-blue-200/20 rounded-full blur-3xl -z-10"></div>

        {/* Clinical Header */}
        <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200/80 sticky top-0 z-20 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] transition-all">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-20">
              <div className="flex items-center gap-4">
                <div className="relative flex items-center justify-center bg-gradient-to-tr from-[#0F766E] to-[#14B8A6] p-2.5 rounded-xl text-white shadow-lg shadow-teal-500/30">
                  <Activity className="w-7 h-7 animate-heartbeat" />
                </div>
                <div>
                  <h1 className="text-2xl font-display font-extrabold text-slate-900 tracking-tight">
                    Vaidya<span className="text-teal-600">Vaani</span>
                  </h1>
                  <p className="text-sm text-slate-500 font-medium tracking-wide flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
                    Clinical AI Intelligence
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <Tabs defaultValue="parser" className="w-full space-y-10">
            
            <div className="flex justify-center flex-col items-center gap-6">
              <div className="text-center max-w-2xl mx-auto mb-2">
                <h2 className="text-3xl font-display font-bold text-slate-800 text-gradient-medical">Smart Prescription Interpretation</h2>
                <p className="text-slate-500 mt-2 text-lg">Decode, translate, and understand medical prescriptions safely.</p>
              </div>

              <TabsList className="bg-white/90 p-1.5 rounded-2xl shadow-sm border border-slate-200 h-14 flex-wrap sm:flex-nowrap backdrop-blur-md">
                <TabsTrigger 
                  value="parser" 
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-50 data-[state=active]:to-blue-50 data-[state=active]:text-teal-800 data-[state=active]:shadow-sm rounded-xl px-5 py-2.5 flex items-center gap-2.5 font-semibold text-slate-600 transition-all"
                >
                  <ClipboardList className="w-4 h-4" /> 
                  <span className="hidden sm:inline">Diagnostic Parse</span>
                </TabsTrigger>
                
                <TabsTrigger 
                  value="explanation" 
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-50 data-[state=active]:to-blue-50 data-[state=active]:text-teal-800 data-[state=active]:shadow-sm rounded-xl px-5 py-2.5 flex items-center gap-2.5 font-semibold text-slate-600 transition-all"
                >
                  <Globe2 className="w-4 h-4" /> 
                  <span className="hidden sm:inline">Translation & Safety</span>
                </TabsTrigger>

                <TabsTrigger 
                  value="voice" 
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-50 data-[state=active]:to-blue-50 data-[state=active]:text-teal-800 data-[state=active]:shadow-sm rounded-xl px-5 py-2.5 flex items-center gap-2.5 font-semibold text-slate-600 transition-all"
                >
                  <Volume2 className="w-4 h-4" /> 
                  <span className="hidden sm:inline">Vocal Output</span>
                </TabsTrigger>

                <TabsTrigger 
                  value="tracker" 
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-50 data-[state=active]:to-blue-50 data-[state=active]:text-teal-800 data-[state=active]:shadow-sm rounded-xl px-5 py-2.5 flex items-center gap-2.5 font-semibold text-slate-600 transition-all"
                >
                  <Pill className="w-4 h-4" /> 
                  <span className="hidden sm:inline">Med Tracker</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="mt-8">
              <TabsContent value="parser" className="focus-visible:outline-none focus-visible:ring-0">
                <ParserTab />
              </TabsContent>

              <TabsContent value="explanation" className="focus-visible:outline-none focus-visible:ring-0">
                <ExplanationTab />
              </TabsContent>

              <TabsContent value="voice" className="focus-visible:outline-none focus-visible:ring-0">
                <VoiceTab />
              </TabsContent>

              <TabsContent value="tracker" className="focus-visible:outline-none focus-visible:ring-0">
                <MedicineTrackerTab />
              </TabsContent>
            </div>
            
          </Tabs>
        </main>
      </div>
    </PrescriptionProvider>
  );
}

