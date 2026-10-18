"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { submitInterviewAnswer } from "@/lib/api";
import { audioBufferToWav } from "@/lib/audioUtils";
import { Loader2, Mic, Video, VideoOff, MicOff, Play, Square, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import Cookies from "js-cookie";

export default function InterviewRoomPage() {
  const { id } = useParams();
  const router = useRouter();

  // Media states
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const videoChunksRef = useRef<Blob[]>([]);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasPermissions, setHasPermissions] = useState<boolean>(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);

  // Interview states
  const [status, setStatus] = useState<'setup' | 'ready' | 'recording' | 'processing' | 'completed'>('setup');
  const [currentQuestion, setCurrentQuestion] = useState("Could you please introduce yourself and walk me through your background?");
  const [questionNumber, setQuestionNumber] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // Check auth
    if (!Cookies.get('token')) {
      router.push('/login');
      return;
    }
    requestPermissions();

    return () => {
      // Cleanup stream on unmount
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const requestPermissions = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(mediaStream);
      setHasPermissions(true);
      setStatus('ready');
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Media permission error:", err);
      setError("Please allow camera and microphone access to start the interview.");
    }
  };

  const toggleCamera = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setCameraEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleMic = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicEnabled(audioTrack.enabled);
      }
    }
  };

  const startRecording = () => {
    if (!stream) return;
    
    setStatus('recording');
    audioChunksRef.current = [];
    videoChunksRef.current = [];
    
    // 1. Audio recorder for clean WAV extraction
    try {
      const audioStream = new MediaStream(stream.getAudioTracks());
      const audioRecorder = new MediaRecorder(audioStream);
      audioRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      audioRecorderRef.current = audioRecorder;
      audioRecorder.start(200);
    } catch (aErr) {
      console.error("Audio recorder initialization error:", aErr);
    }

    // 2. Video recorder for facial & gaze behavior analysis
    try {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';
      const videoRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      videoRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) videoChunksRef.current.push(event.data);
      };
      videoRecorderRef.current = videoRecorder;
      videoRecorder.start(200);
    } catch (vErr) {
      console.error("Video recorder initialization error:", vErr);
    }
  };

  const stopRecording = () => {
    setStatus('processing');

    const audioPromise = new Promise<Blob>((resolve) => {
      if (!audioRecorderRef.current || audioRecorderRef.current.state === 'inactive') {
        resolve(new Blob(audioChunksRef.current, { type: 'audio/webm' }));
        return;
      }
      audioRecorderRef.current.onstop = () => {
        resolve(new Blob(audioChunksRef.current, { type: 'audio/webm' }));
      };
      audioRecorderRef.current.stop();
    });

    const videoPromise = new Promise<Blob>((resolve) => {
      if (!videoRecorderRef.current || videoRecorderRef.current.state === 'inactive') {
        resolve(new Blob(videoChunksRef.current, { type: 'video/webm' }));
        return;
      }
      videoRecorderRef.current.onstop = () => {
        resolve(new Blob(videoChunksRef.current, { type: 'video/webm' }));
      };
      videoRecorderRef.current.stop();
    });

    Promise.all([audioPromise, videoPromise])
      .then(([audioBlob, videoBlob]) => {
        handleMediaUpload(audioBlob, videoBlob);
      })
      .catch((err) => {
        console.error("Recording stop error:", err);
        setError("Failed to stop recording cleanly.");
        setStatus('ready');
      });
  };

  const handleMediaUpload = async (audioBlob: Blob, videoBlob: Blob) => {
    try {
      const formData = new FormData();

      // Encode WAV for speech emotion model
      if (audioBlob.size > 0) {
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const wavBlob = audioBufferToWav(audioBuffer);
        formData.append('audio', wavBlob, 'answer.wav');
      }

      // Attach video for interview_ai facial & gaze behavior model
      if (videoBlob && videoBlob.size > 0) {
        formData.append('video', videoBlob, 'answer.webm');
      }

      formData.append('question', currentQuestion);

      const res = await submitInterviewAnswer(id as string, formData);
      const { next_question, transcribed_text, is_complete, answered_count, total_questions, written_assessment_required } = res.data.data;

      setTranscript(transcribed_text);
      if (typeof total_questions === 'number') setTotalQuestions(total_questions);

      if (is_complete) {
        setStatus('completed');
        if (written_assessment_required) {
          window.setTimeout(() => router.push(`/assessment/${id}`), 1800);
        }
      } else {
        setCurrentQuestion(next_question);
        setQuestionNumber((typeof answered_count === 'number' ? answered_count : questionNumber) + 1);
        setStatus('ready');
      }
    } catch (err) {
      console.error(err);
      setError("Failed to upload answer. Please try again.");
      setStatus('ready');
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen pt-32 lg:pt-40 pb-12 text-slate-900 selection:bg-emerald- selection:text-emerald- relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          
          {/* Left Column: Video & Controls */}
          <div className="w-full lg:w-2/3 flex flex-col gap-6">
            <div className="relative bg-slate-900 rounded-lg overflow-hidden aspect-video shadow-xl border border-slate-200 group">
              {!hasPermissions ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm text-slate-600 p-8 text-center">
                   <Video className="w-16 h-16 mb-4 opacity-40 text-slate-400" />
                   <h3 className="text-2xl font-outfit font-semibold mb-3 text-slate-800">Camera Access Required</h3>
                   <p className="max-w-md text-slate-500">Please grant your browser permission to access your camera and microphone to continue with the AI interview.</p>
                   {error && <p className="text-red-600 mt-4 font-medium bg-red-50 px-4 py-2 rounded-lg border border-red-200">{error}</p>}
                </div>
              ) : (
                <video 
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted // mute local playback to avoid echo
                  className="w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-700" // mirror effect
                />
              )}

              {/* Status Overlay */}
              {status === 'recording' && (
                <div className="absolute top-6 right-6 flex items-center gap-2.5 bg-white text-red-500 px-4 py-2 rounded-lg shadow-lg border border-slate-100">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                  <span className="text-sm font-bold tracking-widest">RECORDING</span>
                </div>
              )}
            </div>

            {/* Media Controls */}
            <div className="flex justify-center items-center gap-6">
              <button 
                onClick={toggleMic}
                disabled={!hasPermissions || status === 'recording'}
                className={`p-5 rounded-lg transition-all shadow-sm ${micEnabled ? 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 hover:-translate-y-1' : 'bg-red-50 text-red-600 border border-red-200'}`}
                title="Toggle Microphone"
              >
                {micEnabled ? <Mic className="w-7 h-7" /> : <MicOff className="w-7 h-7" />}
              </button>
              <button 
                onClick={toggleCamera}
                disabled={!hasPermissions || status === 'recording'}
                className={`p-5 rounded-lg transition-all shadow-sm ${cameraEnabled ? 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 hover:-translate-y-1' : 'bg-red-50 text-red-600 border border-red-200'}`}
                title="Toggle Camera"
              >
                {cameraEnabled ? <Video className="w-7 h-7" /> : <VideoOff className="w-7 h-7" />}
              </button>
            </div>
          </div>

          {/* Right Column: AI Interaction */}
          <div className="w-full lg:w-1/3 flex flex-col h-full lg:min-h-[500px]">
            <div className="bg-white border border-slate-200 shadow-xl rounded-lg p-8 flex-1 flex flex-col h-full relative overflow-hidden">
              
              {/* Subtle top gradient inside panel */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#008558] to-emerald-"></div>

              {status === 'setup' ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <Loader2 className="w-10 h-10 animate-spin text-[#008558] mb-6" />
                  <h3 className="text-xl font-semibold mb-2 font-outfit text-slate-900">Preparing Interview</h3>
                  <p className="text-slate-500">Connecting to secure room...</p>
                </div>
              ) : status === 'completed' ? (
                <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-lg flex items-center justify-center mb-6 ring-4 ring-emerald-50/50">
                    <CheckCircle className="w-10 h-10" />
                  </div>
                  <h3 className="text-3xl font-bold font-outfit mb-4 text-slate-900">Interview Complete!</h3>
                  <p className="text-slate-500 mb-8 leading-relaxed text-lg">Thank you for your time. Your answers have been successfully recorded and submitted for review by the hiring team.</p>
                  <button onClick={() => router.push('/profile')} className="w-full bg-[#008558] hover:bg-[#006b47] text-white px-6 py-4 rounded-lg font-bold text-lg transition-colors shadow-lg shadow-emerald-/20">
                    Return to Profile
                  </button>
                </motion.div>
              ) : (
                <div className="flex flex-col h-full">
                  <div className="mb-8 flex-1">
                    <div className="flex items-center justify-between mb-6">
                      <div className="inline-flex items-center gap-2 bg-emerald- text-[#008558] px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest border border-emerald-">
                        <div className="w-2 h-2 rounded-full bg-[#008558] animate-pulse" /> AI Interviewer
                      </div>
                      <span className="text-xs font-bold text-slate-500 tracking-wide">
                        Question {questionNumber} of {totalQuestions}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1.5 w-full bg-slate-100 rounded-full mb-6 overflow-hidden">
                      <div
                        className="h-full bg-[#008558] rounded-full transition-all duration-500"
                        style={{ width: `${(questionNumber / totalQuestions) * 100}%` }}
                      />
                    </div>

                    <h2 className="text-2xl lg:text-3xl font-medium leading-relaxed font-outfit text-slate-900">{currentQuestion}</h2>
                  </div>

                  {status === 'processing' && (
                    <div className="flex-1 flex flex-col items-center justify-center py-8">
                      <Loader2 className="w-12 h-12 animate-spin text-[#008558] mb-6" />
                      <p className="text-slate-500 font-medium text-lg animate-pulse">Analyzing your response...</p>
                    </div>
                  )}

                  {(status === 'ready' || status === 'recording') && (
                    <div className="mt-auto pt-8 border-t border-slate-100">
                      {status === 'ready' ? (
                        <button 
                          onClick={startRecording}
                          disabled={!hasPermissions}
                          className="w-full flex items-center justify-center gap-3 bg-[#008558] hover:bg-[#006b47] text-white py-4.5 rounded-lg font-bold text-lg transition-all shadow-[0_0_30px_rgba(240,108,58,0.2)] hover:shadow-[0_0_40px_rgba(240,108,58,0.3)] hover:-translate-y-1"
                        >
                          <Play className="w-5 h-5 fill-current" /> Start Answering
                        </button>
                      ) : (
                        <button 
                          onClick={stopRecording}
                          className="w-full flex items-center justify-center gap-3 bg-red-500 hover:bg-red-600 text-white py-4.5 rounded-lg font-bold text-lg transition-all shadow-[0_0_30px_rgba(239,68,68,0.2)] hover:shadow-[0_0_40px_rgba(239,68,68,0.3)] animate-pulse"
                        >
                          <Square className="w-5 h-5 fill-current" /> Finish Answer
                        </button>
                      )}
                      
                      {transcript && status === 'ready' && (
                        <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="mt-6 bg-slate-50 p-5 rounded-lg text-sm text-slate-600 border border-slate-200">
                          <span className="font-bold text-slate-800 block mb-2 uppercase tracking-wide text-xs">Previous Answer Transcript:</span>
                          <span className="italic leading-relaxed">"{transcript}"</span>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* Moving Text Banner - Full Width */}
      <div className="mt-12 w-full bg-white border-y border-slate-100 overflow-hidden py-4 flex whitespace-nowrap relative z-10">
        <div className="absolute left-0 top-0 w-24 h-full bg-gradient-to-r from-white to-transparent z-10 pointer-events-none"></div>
        <div className="absolute right-0 top-0 w-24 h-full bg-gradient-to-l from-white to-transparent z-10 pointer-events-none"></div>
        
        <motion.div
          animate={{ x: ["100%", "-100%"] }}
          transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
          className="text-[#008558] font-bold tracking-widest uppercase flex items-center gap-16 text-sm"
        >
          <span>• Interview has started</span>
          <span>• Please speak clearly</span>
          <span>• Do not close this window</span>
          <span>• Ensure a stable internet connection</span>
          <span>• Answer confidently</span>
          <span>• Good luck!</span>
        </motion.div>
      </div>
    </div>
  );
}
