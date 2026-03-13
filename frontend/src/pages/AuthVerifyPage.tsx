import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AuthVerifyPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { verify } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError('No verification token found');
      return;
    }

    verify(token)
      .then(() => {
        navigate('/tools/match-predictor', { replace: true });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Verification failed');
      });
  }, [searchParams, verify, navigate]);

  if (error) {
    return (
      <div className="text-center py-20">
        <div className="text-4xl mb-4">&#10060;</div>
        <h2 className="text-xl font-bold text-white mb-2">Sign-in failed</h2>
        <p className="text-slate-400 mb-6">{error}</p>
        <button
          onClick={() => navigate('/tools/match-predictor')}
          className="text-red-400 hover:text-red-300 font-medium transition-colors"
        >
          Go to Match Model
        </button>
      </div>
    );
  }

  return (
    <div className="text-center py-20">
      <div className="animate-spin w-8 h-8 border-2 border-slate-600 border-t-red-500 rounded-full mx-auto mb-4" />
      <p className="text-slate-400">Signing you in...</p>
    </div>
  );
}
