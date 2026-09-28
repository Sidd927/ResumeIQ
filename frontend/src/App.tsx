import { BrowserRouter, Routes, Route } from 'react-router-dom';

function Landing() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          Resume<span className="text-blue-600">IQ</span>
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          AI-Powered Resume ↔ Job Description Match Engine
        </p>
        <p className="text-sm text-gray-400">
          Phase 0 scaffold — UI coming in Phase 1
        </p>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
