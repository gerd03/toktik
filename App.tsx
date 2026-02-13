import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_700Bold,
  useFonts,
} from "@expo-google-fonts/manrope";
import { Audio } from "expo-av";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import {
  generateAffiliateStrategy,
  generateAutomationStrategy,
  generateLiveFollowUpAnswer,
  generateLiveSellingPlan,
} from "./src/services/gemini";
import {
  getAutomationProfiles,
  getFeedbackExamples,
  getProductProfiles,
  saveAutomationProfile,
  saveFeedbackExample,
  saveProductProfile,
} from "./src/storage";
import {
  AutomationBrief,
  AutomationProfile,
  FeedbackExample,
  LiveFollowUpOutput,
  LiveSellingBrief,
  LiveSellingOutput,
  ProductBrief,
  ProductProfile,
  ScriptPostPackage,
  StrategyOutput,
} from "./src/types";

const EMPTY_PRODUCT: ProductBrief = {
  productName: "",
  niche: "",
  productDescription: "",
  features: "",
  price: "",
  targetAudience: "",
  goal: "Get viral reach and sales on TikTok Shop",
  offerDetails: "",
  objections: "",
};

const EMPTY_AUTOMATION: AutomationBrief = {
  productName: "",
  productInfo: "",
  productDetails: "",
  price: "",
  brandTone: "Confident Taglish, clear, practical, and trustworthy",
};

const EMPTY_LIVE_INPUT: LiveSellingBrief = {
  productName: "",
  productInfo: "",
};

type ProductFieldKey = keyof ProductBrief;
type AutomationFieldKey = keyof AutomationBrief;
type LiveFieldKey = keyof LiveSellingBrief;
type WorkflowMode = "guided" | "automation" | "live";
type OutputView = "summary" | "scripts" | "distribution" | "execution";
const IS_WEB = Platform.OS === "web";
const USE_NATIVE_ANIMATION_DRIVER = !IS_WEB;

function findScriptPostPackage(
  packages: ScriptPostPackage[],
  scriptTitle: string,
  index: number,
): ScriptPostPackage | null {
  const normalized = scriptTitle.toLowerCase().trim();
  const exact = packages.find(
    (item) => item.scriptTitle.toLowerCase().trim() === normalized,
  );
  if (exact) {
    return exact;
  }

  return packages[index] ?? null;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_700Bold,
  });

  const [activeMode, setActiveMode] = useState<WorkflowMode>("guided");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [product, setProduct] = useState<ProductBrief>(EMPTY_PRODUCT);
  const [autoInput, setAutoInput] = useState<AutomationBrief>(EMPTY_AUTOMATION);
  const [liveInput, setLiveInput] = useState<LiveSellingBrief>(EMPTY_LIVE_INPUT);
  const [profiles, setProfiles] = useState<ProductProfile[]>([]);
  const [autoProfiles, setAutoProfiles] = useState<AutomationProfile[]>([]);
  const [feedbackExamples, setFeedbackExamples] = useState<FeedbackExample[]>([]);
  const [strategy, setStrategy] = useState<StrategyOutput | null>(null);
  const [liveOutput, setLiveOutput] = useState<LiveSellingOutput | null>(null);
  const [liveQuestion, setLiveQuestion] = useState("");
  const [liveFollowUp, setLiveFollowUp] = useState<LiveFollowUpOutput | null>(null);
  const [strategySourceMode, setStrategySourceMode] = useState<WorkflowMode | null>(null);
  const [strategyProductName, setStrategyProductName] = useState("");
  const [outputView, setOutputView] = useState<OutputView>("summary");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingLiveFollowUp, setIsGeneratingLiveFollowUp] = useState(false);
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [feedbackRating, setFeedbackRating] = useState<number>(4);
  const [feedbackWorked, setFeedbackWorked] = useState("");
  const [feedbackImprove, setFeedbackImprove] = useState("");
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [statusModalType, setStatusModalType] = useState<"processing" | "success" | "error">(
    "processing",
  );
  const [statusModalTitle, setStatusModalTitle] = useState("");
  const [statusModalMessage, setStatusModalMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [toastTone, setToastTone] = useState<"info" | "success" | "error">("info");
  const [toastMessage, setToastMessage] = useState("");
  const outputFade = useRef(new Animated.Value(1)).current;
  const toastAnim = useRef(new Animated.Value(0)).current;
  const statusModalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingSoundRef = useRef<Audio.Sound | null>(null);
  const successSoundRef = useRef<Audio.Sound | null>(null);
  const errorSoundRef = useRef<Audio.Sound | null>(null);

  const envApiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim() ?? "";
  const effectiveApiKey = (apiKeyInput.trim() || envApiKey).trim();

  const recentFeedback = useMemo(() => feedbackExamples.slice(0, 4), [feedbackExamples]);
  const tuningPreview = useMemo(() => {
    return feedbackExamples.slice(0, 4).map((item) => {
      const prompt = `Product: ${item.productName}\nPreference notes: ${item.whatWorked}\nImprove notes: ${item.whatToImprove}`;
      const response = `Optimized output style from rating ${item.rating}/5`;
      return JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        response,
      });
    });
  }, [feedbackExamples]);

  useEffect(() => {
    async function loadData() {
      const [loadedProfiles, loadedAutoProfiles, loadedFeedback] = await Promise.all([
        getProductProfiles(),
        getAutomationProfiles(),
        getFeedbackExamples(),
      ]);
      setProfiles(loadedProfiles);
      setAutoProfiles(loadedAutoProfiles);
      setFeedbackExamples(loadedFeedback);
    }

    loadData().catch(() => {
      setErrorText("Failed to load local app data.");
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (statusModalTimerRef.current) {
        clearTimeout(statusModalTimerRef.current);
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function initAudio() {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
        });

        const [processingResult, successResult, errorResult] = await Promise.all([
          Audio.Sound.createAsync(require("./assets/sfx-processing.wav"), {
            shouldPlay: false,
            volume: 0.35,
          }),
          Audio.Sound.createAsync(require("./assets/sfx-success.wav"), {
            shouldPlay: false,
            volume: 0.55,
          }),
          Audio.Sound.createAsync(require("./assets/sfx-error.wav"), {
            shouldPlay: false,
            volume: 0.45,
          }),
        ]);

        if (!mounted) {
          await Promise.all([
            processingResult.sound.unloadAsync(),
            successResult.sound.unloadAsync(),
            errorResult.sound.unloadAsync(),
          ]);
          return;
        }

        processingSoundRef.current = processingResult.sound;
        successSoundRef.current = successResult.sound;
        errorSoundRef.current = errorResult.sound;
      } catch {
        processingSoundRef.current = null;
        successSoundRef.current = null;
        errorSoundRef.current = null;
      }
    }

    initAudio().catch(() => {
      processingSoundRef.current = null;
      successSoundRef.current = null;
      errorSoundRef.current = null;
    });

    return () => {
      mounted = false;
      const sounds = [
        processingSoundRef.current,
        successSoundRef.current,
        errorSoundRef.current,
      ].filter((item): item is Audio.Sound => Boolean(item));
      sounds.forEach((sound) => {
        sound.unloadAsync().catch(() => {});
      });
    };
  }, []);

  async function playStatusSound(type: "processing" | "success" | "error") {
    const sound =
      type === "processing"
        ? processingSoundRef.current
        : type === "success"
          ? successSoundRef.current
          : errorSoundRef.current;

    if (!sound) {
      return;
    }

    try {
      await sound.stopAsync();
      await sound.setPositionAsync(0);
      await sound.playAsync();
    } catch {
      // ignore audio playback errors
    }
  }

  function showToast(
    tone: "info" | "success" | "error",
    message: string,
    autoCloseMs = 2600,
  ) {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    toastAnim.setValue(0);
    setToastTone(tone);
    setToastMessage(message);
    setToastVisible(true);

    Animated.timing(toastAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_ANIMATION_DRIVER,
    }).start();

    if (autoCloseMs > 0) {
      toastTimerRef.current = setTimeout(() => {
        hideToast();
      }, autoCloseMs);
    }
  }

  function hideToast() {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    Animated.timing(toastAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: USE_NATIVE_ANIMATION_DRIVER,
    }).start(() => {
      setToastVisible(false);
    });
  }

  function isQuotaOrCreditError(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      lower.includes("quota") ||
      lower.includes("resource exhausted") ||
      lower.includes("429") ||
      lower.includes("billing") ||
      lower.includes("insufficient") ||
      lower.includes("credit")
    );
  }

  function normalizeGenerationError(error: unknown, fallback: string): string {
    const raw = error instanceof Error ? error.message : fallback;
    if (isQuotaOrCreditError(raw)) {
      return "Gemini API credits/quota are exhausted. Please top up or use a new key, then try again.";
    }
    return raw;
  }

  function showStatusModal(
    type: "processing" | "success" | "error",
    title: string,
    message: string,
    autoCloseMs?: number,
  ) {
    if (statusModalTimerRef.current) {
      clearTimeout(statusModalTimerRef.current);
      statusModalTimerRef.current = null;
    }

    setStatusModalType(type);
    setStatusModalTitle(title);
    setStatusModalMessage(message);
    setStatusModalVisible(true);
    void playStatusSound(type);

    if (type === "processing") {
      showToast("info", message, 2200);
    } else if (type === "success") {
      showToast("success", message, 2600);
    } else {
      showToast("error", message, 3600);
    }

    if (autoCloseMs && autoCloseMs > 0) {
      statusModalTimerRef.current = setTimeout(() => {
        setStatusModalVisible(false);
      }, autoCloseMs);
    }
  }

  function hideStatusModal() {
    if (statusModalTimerRef.current) {
      clearTimeout(statusModalTimerRef.current);
      statusModalTimerRef.current = null;
    }
    setStatusModalVisible(false);
  }

  function animateOutputTransition() {
    outputFade.setValue(0);
    Animated.timing(outputFade, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_ANIMATION_DRIVER,
    }).start();
  }

  function switchMode(mode: WorkflowMode) {
    if (!IS_WEB) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setActiveMode(mode);
  }

  function switchOutputView(view: OutputView) {
    if (!IS_WEB) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setOutputView(view);
    animateOutputTransition();
  }

  function updateProductField(key: ProductFieldKey, value: string) {
    setProduct((prev) => ({ ...prev, [key]: value }));
  }

  function updateAutoField(key: AutomationFieldKey, value: string) {
    setAutoInput((prev) => ({ ...prev, [key]: value }));
  }

  function updateLiveField(key: LiveFieldKey, value: string) {
    setLiveInput((prev) => ({ ...prev, [key]: value }));
  }

  function clearError() {
    if (errorText) {
      setErrorText("");
    }
  }

  async function reloadProfiles() {
    const [loadedProfiles, loadedAutoProfiles] = await Promise.all([
      getProductProfiles(),
      getAutomationProfiles(),
    ]);
    setProfiles(loadedProfiles);
    setAutoProfiles(loadedAutoProfiles);
  }

  async function handleSaveGuidedProfile() {
    clearError();
    if (!product.productName.trim()) {
      Alert.alert("Missing product name", "Add a product name before saving.");
      return;
    }

    await saveProductProfile(product);
    await reloadProfiles();
    Alert.alert("Saved", "Guided profile saved.");
  }

  async function handleSaveAutoProfile() {
    clearError();
    if (!autoInput.productName.trim()) {
      Alert.alert("Missing product name", "Add a product name before saving.");
      return;
    }

    await saveAutomationProfile(autoInput);
    await reloadProfiles();
    Alert.alert("Saved", "Automation profile saved.");
  }

  function loadGuidedProfileToForm(profile: ProductProfile) {
    const {
      productName,
      niche,
      productDescription,
      features,
      price,
      targetAudience,
      goal,
      offerDetails,
      objections,
    } = profile;

    setProduct({
      productName,
      niche,
      productDescription,
      features,
      price,
      targetAudience,
      goal,
      offerDetails,
      objections,
    });
    switchMode("guided");
  }

  function loadAutoProfileToForm(profile: AutomationProfile) {
    const { productName, productInfo, productDetails, price, brandTone } = profile;
    setAutoInput({ productName, productInfo, productDetails, price, brandTone });
    switchMode("automation");
  }

  function validateApi(): boolean {
    if (!effectiveApiKey) {
      const message = "Gemini API key is required. Put it in the field or in .env.";
      setErrorText(message);
      showToast("error", message, 3400);
      return false;
    }
    return true;
  }

  function getEffectiveFeedbackExamples(): FeedbackExample[] {
    const worked = feedbackWorked.trim();
    const improve = feedbackImprove.trim();
    if (!worked && !improve) {
      return feedbackExamples;
    }

    const transient: FeedbackExample = {
      id: `transient_${Date.now()}`,
      createdAt: new Date().toISOString(),
      rating: feedbackRating,
      whatWorked: worked,
      whatToImprove: improve,
      productName:
        strategyProductName ||
        product.productName ||
        autoInput.productName ||
        liveInput.productName ||
        "Current product",
      outputSnapshot: "Transient unsaved feedback from current session.",
    };

    return [transient, ...feedbackExamples];
  }

  async function handleGenerateGuided() {
    clearError();
    if (!product.productName.trim()) {
      setErrorText("Product name is required for Guided mode.");
      return;
    }

    if (!product.productDescription.trim()) {
      setErrorText("Product description is required for Guided mode.");
      return;
    }

    if (!product.targetAudience.trim()) {
      setErrorText("Target audience is required for Guided mode.");
      return;
    }

    if (!validateApi()) {
      return;
    }

    showStatusModal(
      "processing",
      "Generating Guided Plan",
      "Please wait while AI builds scripts, post kits, and strategy.",
    );
    setIsGenerating(true);

    try {
      await saveProductProfile(product);
      const effectiveFeedbackExamples = getEffectiveFeedbackExamples();
      const output = await generateAffiliateStrategy({
        apiKey: effectiveApiKey,
        product,
        feedbackExamples: effectiveFeedbackExamples,
      });
      setStrategy(output);
      setLiveOutput(null);
      setLiveFollowUp(null);
      setLiveQuestion("");
      setStrategySourceMode("guided");
      setStrategyProductName(product.productName.trim());
      setOutputView("summary");
      animateOutputTransition();
      await reloadProfiles();
      showStatusModal(
        "success",
        "Successfully Generated",
        "Guided output is ready. Review the tabs in AI Output.",
        1800,
      );
    } catch (error) {
      const message = normalizeGenerationError(error, "Failed to generate strategy.");
      setErrorText(message);
      showStatusModal(
        "error",
        isQuotaOrCreditError(message) ? "API Credits Exhausted" : "Generation Failed",
        message,
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerateAutomation() {
    clearError();
    if (!autoInput.productName.trim()) {
      setErrorText("Product name is required for AutoPilot mode.");
      return;
    }
    if (!autoInput.productInfo.trim() && !autoInput.productDetails.trim()) {
      setErrorText("Add product info or details in AutoPilot mode.");
      return;
    }
    if (!validateApi()) {
      return;
    }

    showStatusModal(
      "processing",
      "Generating AutoPilot Plan",
      "Please wait while AI infers strategy and creates script-ready output.",
    );
    setIsGenerating(true);
    try {
      await saveAutomationProfile(autoInput);
      const effectiveFeedbackExamples = getEffectiveFeedbackExamples();
      const output = await generateAutomationStrategy({
        apiKey: effectiveApiKey,
        input: autoInput,
        feedbackExamples: effectiveFeedbackExamples,
      });
      setStrategy(output);
      setLiveOutput(null);
      setLiveFollowUp(null);
      setLiveQuestion("");
      setStrategySourceMode("automation");
      setStrategyProductName(autoInput.productName.trim());
      setOutputView("summary");
      animateOutputTransition();
      await reloadProfiles();
      showStatusModal(
        "success",
        "Successfully Generated",
        "AutoPilot output is ready. Review the tabs in AI Output.",
        1800,
      );
    } catch (error) {
      const message = normalizeGenerationError(
        error,
        "Failed to generate automation output.",
      );
      setErrorText(message);
      showStatusModal(
        "error",
        isQuotaOrCreditError(message) ? "API Credits Exhausted" : "Generation Failed",
        message,
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerateLiveSelling() {
    clearError();
    if (!liveInput.productName.trim()) {
      setErrorText("Product name is required for Live Selling mode.");
      return;
    }
    if (!liveInput.productInfo.trim()) {
      setErrorText("Product info/description is required for Live Selling mode.");
      return;
    }
    if (!validateApi()) {
      return;
    }

    showStatusModal(
      "processing",
      "Generating Live Selling Kit",
      "Please wait while AI creates your live script playbook and FAQ responses.",
    );
    setIsGenerating(true);
    try {
      const effectiveFeedbackExamples = getEffectiveFeedbackExamples();
      const output = await generateLiveSellingPlan({
        apiKey: effectiveApiKey,
        input: liveInput,
        feedbackExamples: effectiveFeedbackExamples,
      });
      setLiveOutput(output);
      setLiveFollowUp(null);
      setLiveQuestion("");
      setStrategy(null);
      setStrategySourceMode("live");
      setStrategyProductName(liveInput.productName.trim());
      animateOutputTransition();
      showStatusModal(
        "success",
        "Successfully Generated",
        "Live selling playbook is ready. Scroll to Live Selling Output.",
        1800,
      );
    } catch (error) {
      const message = normalizeGenerationError(
        error,
        "Failed to generate live selling output.",
      );
      setErrorText(message);
      showStatusModal(
        "error",
        isQuotaOrCreditError(message) ? "API Credits Exhausted" : "Generation Failed",
        message,
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerateLiveFollowUp() {
    clearError();
    if (!liveOutput) {
      setErrorText("Generate a Live Selling output first.");
      return;
    }
    if (!liveQuestion.trim()) {
      setErrorText("Type a live viewer question first.");
      return;
    }
    if (!validateApi()) {
      return;
    }

    setIsGeneratingLiveFollowUp(true);
    try {
      const effectiveFeedbackExamples = getEffectiveFeedbackExamples();
      const output = await generateLiveFollowUpAnswer({
        apiKey: effectiveApiKey,
        input: liveInput,
        question: liveQuestion.trim(),
        liveOutput,
        feedbackExamples: effectiveFeedbackExamples,
      });
      setLiveFollowUp(output);
    } catch (error) {
      const message = normalizeGenerationError(
        error,
        "Failed to generate live follow-up answer.",
      );
      setErrorText(message);
      if (isQuotaOrCreditError(message)) {
        showStatusModal("error", "API Credits Exhausted", message);
      } else {
        showToast("error", message, 3600);
      }
    } finally {
      setIsGeneratingLiveFollowUp(false);
    }
  }

  async function handleSaveFeedback() {
    if (!strategy) {
      return;
    }

    const selectedName = strategyProductName.trim();
    if (!selectedName) {
      setErrorText("Generate one strategy first before saving feedback.");
      return;
    }

    setIsSavingFeedback(true);
    clearError();

    try {
      const snapshot = JSON.stringify({
        mode: strategySourceMode,
        summary: strategy.strategySummary,
        complianceNote: strategy.complianceNotes[0] ?? "",
        hooks: strategy.hooks.slice(0, 3),
        firstScript: strategy.videoScripts[0]?.script ?? "",
        firstPostTitle: strategy.scriptPostPackages[0]?.postTitle ?? "",
      }).slice(0, 500);

      await saveFeedbackExample({
        rating: feedbackRating,
        whatWorked: feedbackWorked.trim(),
        whatToImprove: feedbackImprove.trim(),
        productName: selectedName,
        outputSnapshot: snapshot,
      });

      const loadedFeedback = await getFeedbackExamples();
      setFeedbackExamples(loadedFeedback);
      setFeedbackWorked("");
      setFeedbackImprove("");
      Alert.alert("Saved", "Feedback added to your local alignment memory.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save feedback.";
      setErrorText(message);
    } finally {
      setIsSavingFeedback(false);
    }
  }

  async function handleRegenerate() {
    const regenerateMode = strategySourceMode ?? activeMode;
    if (regenerateMode === "automation") {
      await handleGenerateAutomation();
      return;
    }
    if (regenerateMode === "live") {
      await handleGenerateLiveSelling();
      return;
    }
    await handleGenerateGuided();
  }

  const activeModeLabel =
    activeMode === "automation"
      ? "AutoPilot"
      : activeMode === "live"
        ? "Live Selling"
        : "Guided";
  const lastGeneratedLabel =
    strategySourceMode === "automation"
      ? "AutoPilot"
      : strategySourceMode === "live"
        ? "Live Selling"
      : strategySourceMode === "guided"
        ? "Guided"
        : "None yet";
  const isOutputModeMismatch =
    Boolean(strategy) &&
    Boolean(strategySourceMode) &&
    strategySourceMode !== activeMode;

  if (!fontsLoaded) {
    return (
      <SafeAreaView style={styles.loadingSafeArea}>
        <ActivityIndicator size="large" color="#0f766e" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={["#e7f0ff", "#ecf7ff", "#f5fffb", "#fff5ec"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.pageGradient}
      >
        <LinearGradient
          colors={["rgba(255,255,255,0.55)", "rgba(255,255,255,0.06)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.glowOrbTop}
        />
        <LinearGradient
          colors={["rgba(28,132,255,0.22)", "rgba(64,221,173,0.08)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.glowOrbRight}
        />
        <LinearGradient
          colors={["rgba(255,197,129,0.24)", "rgba(255,255,255,0.08)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.glowOrbBottom}
        />
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <BlurView intensity={46} tint="light" style={styles.heroWrap}>
              <LinearGradient
                colors={["rgba(15,118,110,0.9)", "rgba(10,73,115,0.86)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroCard}
              >
                <View style={styles.heroShine} />
                <Text style={styles.heroTitle}>Affiliate Growth Copilot</Text>
                <Text style={styles.heroSubtitle}>
                  Modern mobile workflow for TikTok affiliates. Choose how much control you want.
                </Text>
                <View style={styles.heroBadgeRow}>
                  <Badge text="3 Workflow Options" />
                  <Badge text="Taglish Script Engine" />
                  <Badge text="Feedback Memory" />
                </View>
              </LinearGradient>
            </BlurView>

          <SectionCard
            title="Choose Workflow"
            subtitle="Pick how you want to work today: detailed strategy, fast automation, or live selling scripts."
          >
            <View style={styles.modeSwitch}>
              <ModeButton
                label="Guided Studio"
                isActive={activeMode === "guided"}
                onPress={() => switchMode("guided")}
              />
              <ModeButton
                label="AutoPilot"
                isActive={activeMode === "automation"}
                onPress={() => switchMode("automation")}
              />
              <ModeButton
                label="Live Selling"
                isActive={activeMode === "live"}
                onPress={() => switchMode("live")}
              />
            </View>
          </SectionCard>

          <SectionCard title="Gemini Setup" subtitle="Secure input field. You can also load from .env.">
            <Field
              label="Gemini API Key"
              value={apiKeyInput}
              onChangeText={setApiKeyInput}
              placeholder="AIza..."
              secureTextEntry
            />
            <Text style={styles.metaText}>
              Active key source: {apiKeyInput.trim() ? "input field" : envApiKey ? ".env file" : "none"}
            </Text>
          </SectionCard>

          {activeMode === "guided" ? (
            <SectionCard
              title="Option 1: Guided Strategy Studio"
              subtitle="You provide detailed inputs. AI returns tighter scripts and strategy."
            >
              <Field
                label="Product Name"
                value={product.productName}
                onChangeText={(value) => updateProductField("productName", value)}
                placeholder="Example: Hair Straightener Brush"
              />
              <Field
                label="Niche"
                value={product.niche}
                onChangeText={(value) => updateProductField("niche", value)}
                placeholder="Beauty, Home, Fitness..."
              />
              <Field
                label="Product Description"
                value={product.productDescription}
                onChangeText={(value) => updateProductField("productDescription", value)}
                placeholder="Main value and why people need it"
                multiline
              />
              <Field
                label="Features"
                value={product.features}
                onChangeText={(value) => updateProductField("features", value)}
                placeholder="Top features in bullets or commas"
                multiline
              />
              <Field
                label="Price"
                value={product.price}
                onChangeText={(value) => updateProductField("price", value)}
                placeholder="PHP 299"
              />
              <Text style={styles.metaText}>
                Price is used for value context only. Final outputs avoid exact fixed price claims.
              </Text>
              <Field
                label="Target Audience"
                value={product.targetAudience}
                onChangeText={(value) => updateProductField("targetAudience", value)}
                placeholder="Ex: Working moms 25-38 in PH"
                multiline
              />
              <Field
                label="Goal"
                value={product.goal}
                onChangeText={(value) => updateProductField("goal", value)}
                placeholder="Ex: Viral + sales this week"
                multiline
              />
              <Field
                label="Offer Details"
                value={product.offerDetails}
                onChangeText={(value) => updateProductField("offerDetails", value)}
                placeholder="Voucher, bundle, free shipping"
                multiline
              />
              <Field
                label="Common Objections"
                value={product.objections}
                onChangeText={(value) => updateProductField("objections", value)}
                placeholder="Ex: too expensive, unsure if legit"
                multiline
              />
              <View style={styles.actionRow}>
                <ActionButton
                  label="Save Guided Profile"
                  kind="secondary"
                  disabled={isGenerating}
                  onPress={handleSaveGuidedProfile}
                />
                <ActionButton
                  label={isGenerating ? "Generating..." : "Generate Guided Plan"}
                  kind="primary"
                  disabled={isGenerating}
                  onPress={handleGenerateGuided}
                />
              </View>
            </SectionCard>
          ) : null}

          {activeMode === "automation" ? (
            <SectionCard
              title="Option 2: AutoPilot Automation"
              subtitle="Minimal input mode. AI infers audience, content angles, scripts, and plan."
            >
              <Field
                label="Product Name"
                value={autoInput.productName}
                onChangeText={(value) => updateAutoField("productName", value)}
                placeholder="Example: Portable Blender"
              />
              <Field
                label="Product Info"
                value={autoInput.productInfo}
                onChangeText={(value) => updateAutoField("productInfo", value)}
                placeholder="Short product summary"
                multiline
              />
              <Field
                label="Product Details / Specs"
                value={autoInput.productDetails}
                onChangeText={(value) => updateAutoField("productDetails", value)}
                placeholder="Features, materials, use case, shipping notes"
                multiline
              />
              <Field
                label="Price"
                value={autoInput.price}
                onChangeText={(value) => updateAutoField("price", value)}
                placeholder="PHP 399"
              />
              <Text style={styles.metaText}>
                Price is treated as context. AI will use dynamic wording like "check latest price in basket".
              </Text>
              <Field
                label="Brand Tone"
                value={autoInput.brandTone}
                onChangeText={(value) => updateAutoField("brandTone", value)}
                placeholder="Confident, practical, and friendly"
                multiline
              />
              <View style={styles.actionRow}>
                <ActionButton
                  label="Save AutoPilot Profile"
                  kind="secondary"
                  disabled={isGenerating}
                  onPress={handleSaveAutoProfile}
                />
                <ActionButton
                  label={isGenerating ? "Generating..." : "Generate AutoPilot Plan"}
                  kind="primary"
                  disabled={isGenerating}
                  onPress={handleGenerateAutomation}
                />
              </View>
            </SectionCard>
          ) : null}

          {activeMode === "live" ? (
            <SectionCard
              title="Option 3: Live Selling Copilot"
              subtitle="Input product basics. AI gives live script flow, FAQ answers, and safe response lines."
            >
              <Field
                label="Product Name"
                value={liveInput.productName}
                onChangeText={(value) => updateLiveField("productName", value)}
                placeholder="Example: Nvision IP24V1 Monitor"
              />
              <Field
                label="Product Info / Description"
                value={liveInput.productInfo}
                onChangeText={(value) => updateLiveField("productInfo", value)}
                placeholder="Use case, key specs, inclusions, and audience fit"
                multiline
              />
              <Text style={styles.metaText}>
                Output includes live title (15+ chars), about-me text (30+ chars), repeat lines for low/high viewers, and FAQ responses.
              </Text>
              <View style={styles.actionRowSingle}>
                <ActionButton
                  label={isGenerating ? "Generating..." : "Generate Live Selling Script"}
                  kind="primary"
                  disabled={isGenerating}
                  onPress={handleGenerateLiveSelling}
                />
              </View>
            </SectionCard>
          ) : null}

          {activeMode === "guided" && profiles.length ? (
            <SectionCard title="Saved Guided Profiles" subtitle="Tap to load this profile.">
              <View style={styles.tagWrap}>
                {profiles.slice(0, 8).map((profile) => (
                  <ProfileTag
                    key={profile.id}
                    title={profile.productName}
                    subtitle={profile.niche || "No niche"}
                    onPress={() => loadGuidedProfileToForm(profile)}
                  />
                ))}
              </View>
            </SectionCard>
          ) : null}

          {activeMode === "automation" && autoProfiles.length ? (
            <SectionCard title="Saved AutoPilot Profiles" subtitle="Tap to load this profile.">
              <View style={styles.tagWrap}>
                {autoProfiles.slice(0, 8).map((profile) => (
                  <ProfileTag
                    key={profile.id}
                    title={profile.productName}
                    subtitle={profile.price || "No price"}
                    onPress={() => loadAutoProfileToForm(profile)}
                  />
                ))}
              </View>
            </SectionCard>
          ) : null}

          {errorText ? (
            <SectionCard title="Error" subtitle="Fix this first before generating.">
              <Text style={styles.errorText}>{errorText}</Text>
            </SectionCard>
          ) : null}

          {liveOutput && activeMode === "live" ? (
            <SectionCard
              title="Live Selling Output"
              subtitle="Use these lines live. Repeat and adapt based on audience flow."
            >
              <MiniTitle text="Live Title (15+ chars)" />
              <Text style={styles.liveHeadline}>{liveOutput.liveTitle}</Text>

              <MiniTitle text="About Me (30+ chars)" />
              <Text style={styles.bodyText}>{liveOutput.aboutMe}</Text>

              <MiniTitle text="Opening Lines" />
              <SimpleList items={liveOutput.openingLines} />

              <MiniTitle text="Product Pitch Lines" />
              <SimpleList items={liveOutput.productPitchLines} />

              <MiniTitle text="Repeat When Viewers Are Low" />
              <SimpleList items={liveOutput.lowViewerRepeatLines} />

              <MiniTitle text="Repeat When Viewers Increase" />
              <SimpleList items={liveOutput.highViewerRepeatLines} />

              <MiniTitle text="Engagement Prompts" />
              <SimpleList items={liveOutput.engagementPrompts} />

              <MiniTitle text="Closing Lines" />
              <SimpleList items={liveOutput.closingLines} />

              <MiniTitle text="FAQ with Suggested Answers" />
              {liveOutput.faqs.map((item, index) => (
                <View key={`${item.question}_${index}`} style={styles.faqCard}>
                  <Text style={styles.faqQuestion}>
                    Q{index + 1}: {item.question}
                  </Text>
                  <Text style={styles.faqAnswer}>A: {item.answer}</Text>
                </View>
              ))}

              <MiniTitle text="Unknown Question Response Framework" />
              <SimpleList items={liveOutput.randomQuestionFramework} />

              <MiniTitle text="Compliance Guardrails" />
              <SimpleList items={liveOutput.complianceNotes} />
            </SectionCard>
          ) : null}

          {liveOutput && activeMode === "live" ? (
            <SectionCard
              title="Live Follow-up Q&A"
              subtitle="Type random viewer questions that are not in FAQ and generate compliant answers."
            >
              <Field
                label="Viewer Question"
                value={liveQuestion}
                onChangeText={setLiveQuestion}
                placeholder="Ex: Safe ba ito for everyday use? Bakit iba minsan ang price?"
                multiline
              />
              <View style={styles.actionRowSingle}>
                <ActionButton
                  label={isGeneratingLiveFollowUp ? "Generating..." : "Generate Live Answer"}
                  kind="primary"
                  disabled={isGeneratingLiveFollowUp || isGenerating}
                  onPress={handleGenerateLiveFollowUp}
                />
              </View>

              {liveFollowUp ? (
                <View style={styles.postKitCard}>
                  <Text style={styles.postKitLabel}>Question</Text>
                  <Text style={styles.postKitValue}>{liveFollowUp.question}</Text>
                  <Text style={styles.postKitLabel}>Live Answer</Text>
                  <Text style={styles.postKitValue}>{liveFollowUp.answer}</Text>
                  <Text style={styles.postKitLabel}>Fallback If Unsure</Text>
                  <Text style={styles.postKitValue}>{liveFollowUp.fallbackIfUnsure}</Text>
                  <Text style={styles.postKitLabel}>Compliance Notes</Text>
                  <SimpleList items={liveFollowUp.complianceNotes} />
                </View>
              ) : null}
            </SectionCard>
          ) : null}

          {strategy && activeMode !== "live" ? (
            <SectionCard
              title="AI Output"
              subtitle="Review the latest generated strategy output."
            >
              <View style={styles.modePillRow}>
                <ModePill label={`Workspace: ${activeModeLabel}`} tone="active" />
                <ModePill
                  label={`Last Output: ${lastGeneratedLabel}`}
                  tone={isOutputModeMismatch ? "warning" : "neutral"}
                />
              </View>
              {isOutputModeMismatch ? (
                <View style={styles.modeNoticeCard}>
                  <Text style={styles.modeNoticeText}>
                    You are currently in {activeModeLabel} workspace, but this result
                    was generated from {lastGeneratedLabel} mode.
                    Generate again to update this output for your current workspace.
                  </Text>
                </View>
              ) : null}
              <View style={styles.outputTabsRow}>
                <OutputTabButton
                  label="Summary"
                  isActive={outputView === "summary"}
                  onPress={() => switchOutputView("summary")}
                />
                <OutputTabButton
                  label="Hooks + Scripts"
                  isActive={outputView === "scripts"}
                  onPress={() => switchOutputView("scripts")}
                />
                <OutputTabButton
                  label="Distribution"
                  isActive={outputView === "distribution"}
                  onPress={() => switchOutputView("distribution")}
                />
                <OutputTabButton
                  label="Execution"
                  isActive={outputView === "execution"}
                  onPress={() => switchOutputView("execution")}
                />
              </View>

              <Animated.View
                style={[
                  styles.outputPanel,
                  {
                    opacity: outputFade,
                    transform: [
                      {
                        translateY: outputFade.interpolate({
                          inputRange: [0, 1],
                          outputRange: [8, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {outputView === "summary" ? (
                  <>
                    <MiniTitle text="Strategy Summary" />
                    <Text style={styles.bodyText}>{strategy.strategySummary}</Text>

                    {strategy.complianceNotes.length ? (
                      <>
                        <MiniTitle text="Compliance Guardrails" />
                        <SimpleList items={strategy.complianceNotes} />
                      </>
                    ) : null}

                    <MiniTitle text="Positioning" />
                    <Bullet text={`Audience: ${strategy.positioning.audience}`} />
                    <Bullet text={`Pain Point: ${strategy.positioning.painPoint}`} />
                    <Bullet text={`Offer Angle: ${strategy.positioning.offerAngle}`} />

                    {strategy.assumptions.length ? (
                      <>
                        <MiniTitle text="AI Assumptions (Automation Logic)" />
                        <SimpleList items={strategy.assumptions} />
                      </>
                    ) : null}
                  </>
                ) : null}

                {outputView === "scripts" ? (
                  <>
                    <MiniTitle text="Hook Ideas" />
                    <SimpleList items={strategy.hooks} />

                    <MiniTitle text="Video Scripts" />
                    {strategy.videoScripts.map((script, index) => {
                      const postPackage = findScriptPostPackage(
                        strategy.scriptPostPackages,
                        script.title,
                        index,
                      );
                      return (
                        <View key={`${script.title}_${script.durationSec}`} style={styles.scriptCard}>
                          <Text style={styles.scriptTitle}>
                            {script.title} ({script.durationSec}s)
                          </Text>
                          <Text style={styles.bodyText}>{script.script}</Text>

                          {postPackage ? (
                            <View style={styles.postKitCard}>
                              <Text style={styles.postKitTitle}>Post Kit for This Script</Text>
                              <Text style={styles.postKitLabel}>Title</Text>
                              <Text style={styles.postKitValue}>{postPackage.postTitle}</Text>
                              <Text style={styles.postKitLabel}>Description</Text>
                              <Text style={styles.postKitValue}>{postPackage.postDescription}</Text>
                              <Text style={styles.postKitLabel}>Hashtags</Text>
                              <Text style={styles.postKitValue}>
                                {postPackage.hashtags.join(" ")}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      );
                    })}

                    <MiniTitle text="CTA Options" />
                    <SimpleList items={strategy.ctaOptions} />

                    <MiniTitle text="Caption Ideas" />
                    <SimpleList items={strategy.captions} />
                  </>
                ) : null}

                {outputView === "distribution" ? (
                  <>
                    <MiniTitle text="Hashtag Sets" />
                    {strategy.hashtagSets.map((set, index) => (
                      <Text key={`set_${index}`} style={styles.bodyText}>
                        {index + 1}. {set.join(" ")}
                      </Text>
                    ))}

                    <MiniTitle text="Live Plan" />
                    <SimpleList items={strategy.livePlan} />
                  </>
                ) : null}

                {outputView === "execution" ? (
                  <>
                    <MiniTitle text="14-Day Posting Plan" />
                    <SimpleList items={strategy.postingPlan14Days} />

                    <MiniTitle text="A/B Tests" />
                    <SimpleList items={strategy.abTests} />

                    <MiniTitle text="KPI Focus" />
                    <SimpleList items={strategy.kpiFocus} />

                    <MiniTitle text="Next 24 Hours" />
                    <SimpleList items={strategy.nextActions24h} />
                  </>
                ) : null}
              </Animated.View>
            </SectionCard>
          ) : null}

          {strategy && activeMode !== "live" ? (
            <SectionCard
              title="Alignment Feedback"
              subtitle="Rate this output. Next generations will align to your preferences."
            >
              <Text style={styles.metaText}>
                Regenerate applies your current feedback text immediately. Save Feedback stores it for future sessions.
              </Text>
              <Text style={styles.metaText}>Rating</Text>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable
                    key={value}
                    style={[
                      styles.ratingChip,
                      feedbackRating === value ? styles.ratingChipActive : null,
                    ]}
                    onPress={() => setFeedbackRating(value)}
                    accessibilityRole="button"
                    accessibilityLabel={`Set rating to ${value}`}
                    accessibilityState={{ selected: feedbackRating === value }}
                  >
                    <Text
                      style={[
                        styles.ratingChipText,
                        feedbackRating === value ? styles.ratingChipTextActive : null,
                      ]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Field
                label="What worked"
                value={feedbackWorked}
                onChangeText={setFeedbackWorked}
                placeholder="Ex: Hook #1 and #4 felt natural for PH moms"
                multiline
              />
              <Field
                label="What to improve"
                value={feedbackImprove}
                onChangeText={setFeedbackImprove}
                placeholder="Ex: Add stronger urgency and cleaner CTA"
                multiline
              />
              <View style={styles.actionRow}>
                <ActionButton
                  label={isSavingFeedback ? "Saving..." : "Save Feedback"}
                  kind="secondary"
                  disabled={isSavingFeedback}
                  onPress={handleSaveFeedback}
                />
                <ActionButton
                  label={isGenerating ? "Generating..." : "Regenerate"}
                  kind="primary"
                  disabled={isGenerating}
                  onPress={handleRegenerate}
                />
              </View>
            </SectionCard>
          ) : null}

            <SectionCard
              title="Memory & Tuning"
              subtitle="Local memory-based alignment is active. Vertex tuning preview included."
            >
              <Text style={styles.bodyText}>Stored feedback examples: {feedbackExamples.length}</Text>
              {recentFeedback.map((item) => (
                <Text key={item.id} style={styles.metaText}>
                  [{item.rating}/5] {item.productName} - {item.whatWorked || "No note"}
                </Text>
              ))}
              {tuningPreview.length ? (
                <>
                  <MiniTitle text="Vertex Tuning Preview (JSONL-style lines)" />
                  {tuningPreview.map((line, index) => (
                    <Text key={`tune_${index}`} style={styles.tuningLine}>
                      {line}
                    </Text>
                  ))}
                </>
              ) : null}
            </SectionCard>
          </ScrollView>
        </KeyboardAvoidingView>

        {toastVisible ? (
          <View pointerEvents="box-none" style={styles.toastLayer}>
            <Animated.View
              style={[
                styles.toastCard,
                toastTone === "success" ? styles.toastSuccess : null,
                toastTone === "error" ? styles.toastError : null,
                {
                  opacity: toastAnim,
                  transform: [
                    {
                      translateY: toastAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-16, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <BlurView intensity={38} tint="light" style={styles.toastGlass}>
                <Text style={styles.toastText}>{toastMessage}</Text>
              </BlurView>
            </Animated.View>
          </View>
        ) : null}
      </LinearGradient>

      <Modal
        transparent
        animationType="fade"
        visible={statusModalVisible}
        onRequestClose={() => {
          if (statusModalType !== "processing") {
            hideStatusModal();
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <BlurView intensity={44} tint="light" style={styles.modalCard}>
            <View
              style={[
                styles.modalIconWrap,
                statusModalType === "success" ? styles.modalIconSuccess : null,
                statusModalType === "error" ? styles.modalIconError : null,
              ]}
            >
              {statusModalType === "processing" ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.modalIconText}>
                  {statusModalType === "success" ? "OK" : "!"}
                </Text>
              )}
            </View>
            <Text style={styles.modalTitle}>{statusModalTitle}</Text>
            <Text style={styles.modalMessage}>{statusModalMessage}</Text>

            {statusModalType === "processing" ? (
              <Text style={styles.modalHint}>Please wait while generation is running...</Text>
            ) : (
              <Pressable style={styles.modalButton} onPress={hideStatusModal}>
                <Text style={styles.modalButtonText}>Close</Text>
              </Pressable>
            )}
          </BlurView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_ANIMATION_DRIVER,
    }).start();
  }, [fadeIn]);

  return (
    <Animated.View
      style={[
        styles.cardMotionWrap,
        {
          opacity: fadeIn,
          transform: [
            {
              translateY: fadeIn.interpolate({
                inputRange: [0, 1],
                outputRange: [6, 0],
              }),
            },
          ],
        },
      ]}
    >
      <BlurView intensity={40} tint="light" style={styles.card}>
        <LinearGradient
          colors={["rgba(255,255,255,0.54)", "rgba(255,255,255,0.04)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardSheen}
        />
        <View pointerEvents="none" style={styles.cardStroke} />
        <Text style={styles.cardTitle}>{title}</Text>
        {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
        {children}
      </BlurView>
    </Animated.View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  multiline?: boolean;
  secureTextEntry?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <BlurView
        intensity={30}
        tint="light"
        style={[styles.inputShell, multiline ? styles.inputShellMultiline : null]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#7f9bb6"
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
          autoCorrect={false}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "auto"}
          style={[styles.input, multiline ? styles.inputMultiline : null]}
          accessibilityLabel={label}
        />
      </BlurView>
    </View>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <BlurView intensity={28} tint="light" style={styles.badge}>
      <Text style={styles.badgeText}>{text}</Text>
    </BlurView>
  );
}

function MiniTitle({ text }: { text: string }) {
  return <Text style={styles.sectionTitle}>{text}</Text>;
}

function Bullet({ text }: { text: string }) {
  return <Text style={styles.bodyText}>- {text}</Text>;
}

function ModeButton({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function pressIn() {
    Animated.spring(scale, {
      toValue: 0.98,
      useNativeDriver: USE_NATIVE_ANIMATION_DRIVER,
      speed: 30,
      bounciness: 0,
    }).start();
  }

  function pressOut() {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: USE_NATIVE_ANIMATION_DRIVER,
      speed: 30,
      bounciness: 0,
    }).start();
  }

  return (
    <Animated.View style={[styles.buttonMotionWrap, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={[styles.modeButton, isActive ? styles.modeButtonActive : null]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: isActive }}
      >
        <Text style={[styles.modeButtonText, isActive ? styles.modeButtonTextActive : null]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function OutputTabButton({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function pressIn() {
    Animated.spring(scale, {
      toValue: 0.98,
      useNativeDriver: USE_NATIVE_ANIMATION_DRIVER,
      speed: 30,
      bounciness: 0,
    }).start();
  }

  function pressOut() {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: USE_NATIVE_ANIMATION_DRIVER,
      speed: 30,
      bounciness: 0,
    }).start();
  }

  return (
    <Animated.View style={[styles.outputTabMotionWrap, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={[styles.outputTab, isActive ? styles.outputTabActive : null]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: isActive }}
      >
        <Text style={[styles.outputTabText, isActive ? styles.outputTabTextActive : null]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function ModePill({
  label,
  tone,
}: {
  label: string;
  tone: "active" | "neutral" | "warning";
}) {
  return (
    <View
      style={[
        styles.modePill,
        tone === "active" ? styles.modePillActive : null,
        tone === "warning" ? styles.modePillWarning : null,
      ]}
    >
      <Text
        style={[
          styles.modePillText,
          tone === "active" ? styles.modePillTextActive : null,
          tone === "warning" ? styles.modePillTextWarning : null,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function ProfileTag({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.profileTag, pressed ? styles.profileTagPressed : null]}
      accessibilityRole="button"
      accessibilityLabel={`Load ${title}`}
    >
      <Text style={styles.profileTitle} numberOfLines={2} ellipsizeMode="tail">
        {title}
      </Text>
      <Text style={styles.profileSubtitle} numberOfLines={1} ellipsizeMode="tail">
        {subtitle}
      </Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  onPress,
  kind,
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind: "primary" | "secondary";
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function pressIn() {
    Animated.spring(scale, {
      toValue: 0.98,
      useNativeDriver: USE_NATIVE_ANIMATION_DRIVER,
      speed: 30,
      bounciness: 0,
    }).start();
  }

  function pressOut() {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: USE_NATIVE_ANIMATION_DRIVER,
      speed: 30,
      bounciness: 0,
    }).start();
  }

  return (
    <Animated.View style={[styles.buttonMotionWrap, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled}
        style={[
          styles.actionButton,
          kind === "primary" ? styles.actionPrimary : styles.actionSecondary,
          disabled ? styles.actionDisabled : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: Boolean(disabled) }}
      >
        <Text style={kind === "primary" ? styles.actionPrimaryText : styles.actionSecondaryText}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function SimpleList({ items }: { items: string[] }) {
  if (!items.length) {
    return <Text style={styles.metaText}>No items generated.</Text>;
  }

  return (
    <View style={styles.simpleList}>
      {items.map((item, index) => (
        <Text key={`${item}_${index}`} style={styles.bodyText}>
          {index + 1}. {item}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingSafeArea: {
    flex: 1,
    backgroundColor: "#e8f0ff",
    alignItems: "center",
    justifyContent: "center",
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#e8f0ff",
  },
  pageGradient: {
    flex: 1,
    position: "relative",
  },
  glowOrbTop: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -90,
    left: -70,
  },
  glowOrbRight: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    top: 130,
    right: -120,
  },
  glowOrbBottom: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    bottom: -120,
    left: -70,
  },
  keyboardAvoid: {
    flex: 1,
  },
  content: {
    width: "100%",
    maxWidth: 980,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 10,
  },
  heroWrap: {
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1.2,
    borderColor: "#b9d6ef",
  },
  heroCard: {
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 22,
    gap: 11,
    position: "relative",
  },
  heroShine: {
    position: "absolute",
    top: -18,
    right: -14,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  heroTitle: {
    color: "#f8fdff",
    fontFamily: "Manrope_700Bold",
    fontSize: 28,
    letterSpacing: 0.4,
  },
  heroSubtitle: {
    color: "#d7f8f7",
    fontFamily: "Manrope_400Regular",
    fontSize: 14,
    lineHeight: 21,
  },
  heroBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  badgeText: {
    color: "#effbff",
    fontFamily: "Manrope_500Medium",
    fontSize: 11.5,
  },
  cardMotionWrap: {
    borderRadius: 20,
    overflow: "hidden",
  },
  card: {
    borderRadius: 20,
    backgroundColor: "rgba(248, 253, 255, 0.52)",
    borderColor: "#d4e4f3",
    borderWidth: 1.15,
    padding: 13,
    gap: 7,
    elevation: 3,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0px 18px 30px rgba(22, 42, 64, 0.14)",
      },
      default: {
        shadowColor: "#10223a",
        shadowOpacity: 0.12,
        shadowOffset: { width: 0, height: 12 },
        shadowRadius: 22,
      },
    }),
  },
  cardSheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 44,
  },
  cardStroke: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d7e6f4",
  },
  cardTitle: {
    fontFamily: "Manrope_700Bold",
    color: "#102f48",
    fontSize: 18,
  },
  cardSubtitle: {
    fontFamily: "Manrope_400Regular",
    color: "#3f5f79",
    fontSize: 13,
    lineHeight: 19,
  },
  modeSwitch: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  buttonMotionWrap: {
    flexGrow: 1,
    flexBasis: 122,
  },
  modeButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#d6e5f4",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.48)",
  },
  modeButtonActive: {
    backgroundColor: "rgba(214, 249, 240, 0.78)",
    borderColor: "#6caea3",
  },
  modeButtonText: {
    fontFamily: "Manrope_500Medium",
    color: "#1d4564",
    fontSize: 13.5,
    textAlign: "center",
  },
  modeButtonTextActive: {
    color: "#0f766e",
    fontFamily: "Manrope_700Bold",
  },
  outputTabsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    paddingVertical: 4,
  },
  modePillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
    marginBottom: 6,
  },
  modePill: {
    borderWidth: 1,
    borderColor: "#d6e6f4",
    backgroundColor: "rgba(255,255,255,0.48)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  modePillActive: {
    borderColor: "#0f766e",
    backgroundColor: "#e4f4ef",
  },
  modePillWarning: {
    borderColor: "#db8a2f",
    backgroundColor: "#fff4e7",
  },
  modePillText: {
    color: "#3b5974",
    fontFamily: "Manrope_700Bold",
    fontSize: 11,
  },
  modePillTextActive: {
    color: "#0f766e",
  },
  modePillTextWarning: {
    color: "#a35f0f",
  },
  modeNoticeCard: {
    borderWidth: 1,
    borderColor: "#e5c499",
    backgroundColor: "#fff7ed",
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
  },
  modeNoticeText: {
    color: "#8a4d09",
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 17,
  },
  outputTabMotionWrap: {
    flexGrow: 1,
    minWidth: 116,
  },
  outputTab: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d6e5f4",
    backgroundColor: "rgba(255,255,255,0.5)",
    paddingHorizontal: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  outputTabActive: {
    borderColor: "#68aba0",
    backgroundColor: "rgba(218,248,240,0.8)",
  },
  outputTabText: {
    color: "#2a4c68",
    fontFamily: "Manrope_500Medium",
    fontSize: 12.5,
  },
  outputTabTextActive: {
    color: "#0f766e",
    fontFamily: "Manrope_700Bold",
  },
  outputPanel: {
    marginTop: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d5e4f3",
    backgroundColor: "rgba(252,255,255,0.66)",
    padding: 10,
    gap: 5,
  },
  fieldWrap: {
    gap: 3,
  },
  label: {
    fontFamily: "Manrope_500Medium",
    fontSize: 13.5,
    color: "#17344d",
  },
  input: {
    minHeight: 48,
    borderWidth: 0,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "transparent",
    color: "#12324e",
    fontFamily: "Manrope_400Regular",
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 92,
  },
  inputShell: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#d7e5f4",
    backgroundColor: "rgba(255,255,255,0.48)",
    borderRadius: 14,
    overflow: "hidden",
  },
  inputShellMultiline: {
    minHeight: 92,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 4,
  },
  actionRowSingle: {
    flexDirection: "row",
    marginTop: 4,
  },
  actionButton: {
    minHeight: 50,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  actionPrimary: {
    backgroundColor: "rgba(16, 132, 124, 0.86)",
    borderColor: "#8fd1c4",
  },
  actionSecondary: {
    backgroundColor: "rgba(255,255,255,0.52)",
    borderColor: "#d4e3f2",
  },
  actionDisabled: {
    opacity: 0.6,
  },
  actionPrimaryText: {
    color: "#ffffff",
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
    textAlign: "center",
  },
  actionSecondaryText: {
    color: "#163956",
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
    textAlign: "center",
  },
  bodyText: {
    color: "#173a56",
    fontFamily: "Manrope_400Regular",
    fontSize: 14,
    lineHeight: 21,
  },
  metaText: {
    color: "#476780",
    fontFamily: "Manrope_400Regular",
    fontSize: 12.5,
    lineHeight: 18,
  },
  sectionTitle: {
    marginTop: 6,
    color: "#123450",
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tagWrap: {
    width: "100%",
    flexDirection: "column",
    gap: 8,
  },
  profileTag: {
    borderWidth: 1,
    borderColor: "#d5e4f3",
    backgroundColor: "rgba(255,255,255,0.54)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    width: "100%",
    minWidth: 0,
    gap: 2,
  },
  profileTagPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  profileTitle: {
    color: "#163a59",
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },
  profileSubtitle: {
    color: "#4a6983",
    fontFamily: "Manrope_400Regular",
    fontSize: 12,
    flexShrink: 1,
  },
  scriptCard: {
    borderWidth: 1,
    borderColor: "#d5e4f3",
    backgroundColor: "rgba(255,255,255,0.56)",
    borderRadius: 13,
    padding: 11,
    gap: 4,
    borderLeftWidth: 4,
    borderLeftColor: "#0f7f74",
  },
  postKitCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#d5e4f3",
    backgroundColor: "rgba(255,255,255,0.62)",
    borderRadius: 10,
    padding: 8,
    gap: 3,
  },
  postKitTitle: {
    color: "#0f4f73",
    fontFamily: "Manrope_700Bold",
    fontSize: 12,
  },
  postKitLabel: {
    marginTop: 3,
    color: "#527089",
    fontFamily: "Manrope_700Bold",
    fontSize: 11,
  },
  postKitValue: {
    color: "#1b3d59",
    fontFamily: "Manrope_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  scriptTitle: {
    color: "#102f4b",
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
  },
  liveHeadline: {
    color: "#0e597f",
    fontFamily: "Manrope_700Bold",
    fontSize: 17,
    lineHeight: 23,
  },
  faqCard: {
    borderWidth: 1,
    borderColor: "#d4e3f2",
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 10,
    padding: 9,
    gap: 4,
    marginTop: 4,
  },
  faqQuestion: {
    color: "#113654",
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
    lineHeight: 18,
  },
  faqAnswer: {
    color: "#1c425f",
    fontFamily: "Manrope_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
  ratingRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  ratingChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#abc1d4",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fbff",
  },
  ratingChipActive: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e",
  },
  ratingChipText: {
    color: "#173e5f",
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
  },
  ratingChipTextActive: {
    color: "#ffffff",
  },
  simpleList: {
    gap: 4,
    marginBottom: 2,
  },
  tuningLine: {
    color: "#516879",
    fontFamily: "Manrope_400Regular",
    fontSize: 11,
    lineHeight: 16,
  },
  errorText: {
    color: "#b4235f",
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(9, 21, 35, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.58)",
    borderWidth: 1,
    borderColor: "#d2e3f3",
    padding: 17,
    alignItems: "center",
    gap: 9,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0px 20px 32px rgba(11, 26, 41, 0.2)",
      },
      default: {
        shadowColor: "#0b1a29",
        shadowOpacity: 0.22,
        shadowOffset: { width: 0, height: 14 },
        shadowRadius: 24,
      },
    }),
  },
  modalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e",
  },
  modalIconSuccess: {
    backgroundColor: "#0f766e",
  },
  modalIconError: {
    backgroundColor: "#c2410c",
  },
  modalIconText: {
    color: "#ffffff",
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
  },
  modalTitle: {
    color: "#102f48",
    fontFamily: "Manrope_700Bold",
    fontSize: 18,
    textAlign: "center",
  },
  modalMessage: {
    color: "#3c5a75",
    fontFamily: "Manrope_400Regular",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  modalHint: {
    marginTop: 2,
    color: "#5e7891",
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
  },
  modalButton: {
    marginTop: 2,
    minHeight: 40,
    minWidth: 120,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e",
  },
  modalButtonText: {
    color: "#ffffff",
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
  },
  toastLayer: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    alignItems: "center",
    zIndex: 80,
  },
  toastCard: {
    width: "100%",
    maxWidth: 680,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d2e2f3",
    backgroundColor: "rgba(255,255,255,0.44)",
    overflow: "hidden",
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: "center",
    ...Platform.select({
      web: {
        boxShadow: "0px 12px 22px rgba(16, 44, 66, 0.18)",
      },
      default: {
        shadowColor: "#102c42",
        shadowOpacity: 0.2,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: 16,
      },
    }),
  },
  toastSuccess: {
    borderColor: "#80cbb5",
    backgroundColor: "rgba(227, 251, 242, 0.58)",
  },
  toastError: {
    borderColor: "#dc9b8f",
    backgroundColor: "rgba(255, 236, 232, 0.62)",
  },
  toastGlass: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toastText: {
    color: "#123a59",
    fontFamily: "Manrope_700Bold",
    fontSize: 12.5,
    lineHeight: 18,
  },
});
