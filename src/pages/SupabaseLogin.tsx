import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Alert, AlertDescription } from '../components/ui/alert'
import { ThemeToggle } from '../components/ui/theme-toggle'
import { useToast } from '../hooks/use-toast'
import { useSupabaseAuth } from '../hooks/useSupabaseAuth'
import { 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  Chrome, 
  Apple, 
  ArrowLeft,
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react'

const SupabaseLogin: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const { 
    isAuthenticated, 
    user, 
    isLoading, 
    signIn, 
    signUp, 
    signInWithGoogle,
    resetPassword 
  } = useSupabaseAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState('Risk Manager')

  // Détecter le paramètre mode pour forcer l'inscription ou la connexion
  useEffect(() => {
    const mode = searchParams.get('mode')
    if (mode === 'signup') {
      setIsSignUp(true)
    } else if (mode === 'login') {
      setIsSignUp(false)
    }
  }, [searchParams])

  // Rediriger si déjà connecté
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate('/dashboard')
    }
  }, [isAuthenticated, user, navigate])

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation des champs
    if (!email || !password) {
      setError('Veuillez remplir tous les champs')
      return
    }

    if (isSignUp && !name.trim()) {
      setError('Veuillez entrer votre nom complet')
      return
    }

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères')
      return
    }

    try {
      console.log('🔄 Tentative d\'authentification:', { email, isSignUp })
      
      let result
      if (isSignUp) {
        result = await signUp(email, password, { name, role })
        if (result.success) {
          toast({
            title: "Inscription réussie",
            description: result.message || "Vérifiez votre email pour confirmer votre compte",
          })
          
          // Si l'email est confirmé automatiquement, rediriger
          if (result.user?.email_confirmed_at) {
            setTimeout(() => {
              navigate('/dashboard')
            }, 2000)
          }
        }
      } else {
        result = await signIn(email, password)
        if (result.success) {
          navigate('/dashboard')
        }
      }

      if (!result.success) {
        setError(result.error || 'Une erreur est survenue')
        console.error('❌ Erreur d\'authentification:', result.error)
      }
    } catch (err) {
      const errorMessage = 'Une erreur inattendue est survenue'
      setError(errorMessage)
      console.error('❌ Erreur d\'authentification:', err)
    }
  }

  const handleGoogleAuth = async () => {
    try {
      const result = await signInWithGoogle()
      if (!result.success) {
        setError(result.error || 'Erreur de connexion Google')
      }
    } catch (err) {
      setError('Erreur de connexion Google')
      console.error('Erreur Google Auth:', err)
    }
  }

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Veuillez entrer votre email d\'abord')
      return
    }

    try {
      const result = await resetPassword(email)
      if (result.success) {
        toast({
          title: "Email envoyé",
          description: "Vérifiez votre boîte email pour réinitialiser votre mot de passe",
        })
      } else {
        setError(result.error || 'Erreur d\'envoi de l\'email')
      }
    } catch (err) {
      setError('Erreur de réinitialisation')
      console.error('Erreur reset password:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="flex items-center gap-2 text-black dark:text-white">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Checking authentication...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center p-6 relative">
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[#C4D82E]/10 dark:bg-[#C4D82E]/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-black/5 dark:bg-white/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Theme Toggle */}
      <div className="absolute top-6 right-6 z-10">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-md">
        {/* Back to landing page */}
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="absolute -top-16 left-0 text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to home
        </Button>

        <Card className="backdrop-blur-xl bg-white dark:bg-black/50 border-black/10 dark:border-white/20 shadow-2xl">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 bg-[#C4D82E] rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-black">FX</span>
              </div>
            </div>
            
            <div>
              <CardTitle className="text-2xl font-bold text-black dark:text-white">
                {isSignUp ? 'Create Account' : 'Sign In'}
              </CardTitle>
              <CardDescription className="text-black/70 dark:text-white/70">
                {isSignUp 
                  ? 'Join the FX risk management platform' 
                  : 'Access your FX dashboard'
                }
              </CardDescription>
            </div>

            {/* Status badges */}
            <div className="flex justify-center gap-2">
              <Badge variant="outline" className="text-[#C4D82E] border-[#C4D82E]/30 dark:text-[#C4D82E] dark:border-[#C4D82E]/30">
                <CheckCircle className="h-3 w-3 mr-1" />
                Secure
              </Badge>
              <Badge variant="outline" className="text-black/70 dark:text-white/70 border-black/20 dark:border-white/20">
                <CheckCircle className="h-3 w-3 mr-1" />
                Supabase
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Error message */}
            {error && (
              <Alert variant="destructive" className="bg-red-500/10 dark:bg-red-500/20 border-red-500/30">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-red-600 dark:text-red-400">{error}</AlertDescription>
              </Alert>
            )}

            {/* Social login buttons */}
            <div className="space-y-3">
              <Button
                onClick={handleGoogleAuth}
                variant="outline"
                className="w-full bg-white dark:bg-black/50 border-black/20 dark:border-white/20 text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/10"
                disabled={isLoading}
              >
                <Chrome className="h-5 w-5 mr-2" />
                Continue with Google
              </Button>

              <Button
                variant="outline"
                className="w-full bg-white dark:bg-black/50 border-black/20 dark:border-white/20 text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/10"
                disabled
              >
                <Apple className="h-5 w-5 mr-2" />
                Continue with Apple
                <Badge variant="secondary" className="ml-2 text-xs">Coming Soon</Badge>
              </Button>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-black/20 dark:border-white/20"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-black/50 text-black/70 dark:text-white/70">or</span>
              </div>
            </div>

            {/* Email/Password form */}
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-black dark:text-white">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-white dark:bg-black/50 border-black/20 dark:border-white/20 text-black dark:text-white placeholder:text-black/50 dark:placeholder:text-white/50"
                    placeholder="Your full name"
                    required={isSignUp}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-black dark:text-white">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-black/50 dark:text-white/50" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-white dark:bg-black/50 border-black/20 dark:border-white/20 text-black dark:text-white placeholder:text-black/50 dark:placeholder:text-white/50"
                    placeholder="your@email.com"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-black dark:text-white">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-black/50 dark:text-white/50" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 bg-white dark:bg-black/50 border-black/20 dark:border-white/20 text-black dark:text-white placeholder:text-black/50 dark:placeholder:text-white/50"
                    placeholder="Your password"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-0 top-0 h-full px-3 text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {!isSignUp && (
                <div className="text-right">
                  <Button
                    type="button"
                    variant="link"
                    onClick={handleForgotPassword}
                    className="text-[#C4D82E] hover:text-[#C4D82E]/80 dark:text-[#C4D82E] dark:hover:text-[#C4D82E]/80 p-0 h-auto"
                  >
                    Forgot password?
                  </Button>
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-[#C4D82E] hover:bg-[#C4D82E]/90 text-black font-semibold"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Button>
            </form>

            {/* Toggle sign up/sign in */}
            <div className="text-center">
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setIsSignUp(!isSignUp)
                  setError('')
                }}
                className="text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white p-0 h-auto"
              >
                {isSignUp 
                  ? 'Already have an account? Sign in' 
                  : 'Don\'t have an account? Create one'
                }
              </Button>
            </div>

            {/* Demo credentials info */}
            {!isSignUp && (
              <div className="mt-6 p-4 bg-[#C4D82E]/10 dark:bg-[#C4D82E]/5 border border-[#C4D82E]/30 dark:border-[#C4D82E]/20 rounded-lg">
                <h4 className="text-sm font-medium text-black/80 dark:text-white/80 mb-2">Demo Account</h4>
                <p className="text-xs text-black/70 dark:text-white/70">
                  Email: <code className="bg-[#C4D82E]/20 dark:bg-[#C4D82E]/10 px-1 rounded text-black dark:text-white">demo@fx-hedging.com</code><br/>
                  Password: <code className="bg-[#C4D82E]/20 dark:bg-[#C4D82E]/10 px-1 rounded text-black dark:text-white">demo123</code>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default SupabaseLogin
