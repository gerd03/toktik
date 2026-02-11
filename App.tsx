import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_700Bold,
  useFonts,
} from "@expo-google-fonts/manrope";
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

type ProductFieldKey = keyof ProductBrief;
type AutomationFieldKey = keyof AutomationBrief;
type WorkflowMode = "guided" | "automation";
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
  const [profiles, setProfiles] = useState<ProductProfile[]>([]);
  const [autoProfiles, setAutoProfiles] = useState<AutomationProfile[]>([]);
  const [feedbackExamples, setFeedbackExamples] = useState<FeedbackExample[]>([]);
  const [strategy, setStrategy] = useState<StrategyOutput | null>(null);
  const [strategySourceMode, setStrategySourceMode] = useState<WorkflowMode | null>(null);
  const [strategyProductName, setStrategyProductName] = useState("");
  const [outputView, setOutputView] = useState<OutputView>("summary");
  const [isGenerating, setIsGenerating] = useState(false);
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
  const outputFade = useRef(new Animated.Value(1)).current;
  const statusModalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    };
  }, []);

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
      setErrorText("Gemini API key is required. Put it in the field or in .env.");
      return false;
    }
    return true;
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
      const output = await generateAffiliateStrategy({
        apiKey: effectiveApiKey,
        product,
        feedbackExamples,
      });
      setStrategy(output);
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
      const message = error instanceof Error ? error.message : "Failed to generate strategy.";
      setErrorText(message);
      showStatusModal("error", "Generation Failed", message);
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
      const output = await generateAutomationStrategy({
        apiKey: effectiveApiKey,
        input: autoInput,
        feedbackExamples,
      });
      setStrategy(output);
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
      const message =
        error instanceof Error ? error.message : "Failed to generate automation output.";
      setErrorText(message);
      showStatusModal("error", "Generation Failed", message);
    } finally {
      setIsGenerating(false);
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
    if (activeMode === "automation") {
      await handleGenerateAutomation();
      return;
    }
    await handleGenerateGuided();
  }

  const activeModeLabel = activeMode === "automation" ? "AutoPilot" : "Guided";
  const lastGeneratedLabel =
    strategySourceMode === "automation"
      ? "AutoPilot"
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
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient colors={["#0f766e", "#0b4f67"]} style={styles.heroCard}>
            <Text style={styles.heroTitle}>Affiliate Growth Copilot</Text>
            <Text style={styles.heroSubtitle}>
              Modern mobile workflow for TikTok affiliates. Choose how much control you want.
            </Text>
            <View style={styles.heroBadgeRow}>
              <Badge text="2 Workflow Options" />
              <Badge text="Taglish Script Engine" />
              <Badge text="Feedback Memory" />
            </View>
          </LinearGradient>

          <SectionCard
            title="Choose Workflow"
            subtitle="Pick how you want to work today: detailed control or fast automation."
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
          ) : (
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
          )}

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

          {strategy ? (
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

          {strategy ? (
            <SectionCard
              title="Alignment Feedback"
              subtitle="Rate this output. Next generations will align to your preferences."
            >
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
          <View style={styles.modalCard}>
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
          </View>
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
        styles.card,
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
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      {children}
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
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8aa0b8"
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "auto"}
        style={[styles.input, multiline ? styles.inputMultiline : null]}
        accessibilityLabel={label}
      />
    </View>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
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
    backgroundColor: "#eef3f8",
    alignItems: "center",
    justifyContent: "center",
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#eef3f8",
  },
  keyboardAvoid: {
    flex: 1,
  },
  content: {
    padding: 14,
    paddingBottom: 34,
    gap: 12,
  },
  heroCard: {
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  heroTitle: {
    color: "#f8fdff",
    fontFamily: "Manrope_700Bold",
    fontSize: 25,
    letterSpacing: 0.2,
  },
  heroSubtitle: {
    color: "#dcf4ff",
    fontFamily: "Manrope_400Regular",
    fontSize: 14,
    lineHeight: 20,
  },
  heroBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 999,
  },
  badgeText: {
    color: "#effbff",
    fontFamily: "Manrope_500Medium",
    fontSize: 11,
  },
  card: {
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderColor: "#d6e2ef",
    borderWidth: 1,
    padding: 14,
    gap: 8,
    elevation: 2,
    ...Platform.select({
      web: {
        boxShadow: "0px 8px 16px rgba(11, 23, 37, 0.05)",
      },
      default: {
        shadowColor: "#0b1725",
        shadowOpacity: 0.05,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 16,
      },
    }),
  },
  cardTitle: {
    fontFamily: "Manrope_700Bold",
    color: "#10283f",
    fontSize: 17,
  },
  cardSubtitle: {
    fontFamily: "Manrope_400Regular",
    color: "#48627c",
    fontSize: 13,
    lineHeight: 18,
  },
  modeSwitch: {
    flexDirection: "row",
    gap: 10,
  },
  buttonMotionWrap: {
    flex: 1,
  },
  modeButton: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#b6cade",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    backgroundColor: "#f8fbff",
  },
  modeButtonActive: {
    backgroundColor: "#e2f4ef",
    borderColor: "#0f766e",
  },
  modeButtonText: {
    fontFamily: "Manrope_500Medium",
    color: "#204564",
    fontSize: 13,
    textAlign: "center",
  },
  modeButtonTextActive: {
    color: "#0f766e",
    fontFamily: "Manrope_700Bold",
  },
  outputTabsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
    borderColor: "#c7d8e8",
    backgroundColor: "#f6faff",
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
    minWidth: 110,
  },
  outputTab: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c4d6e8",
    backgroundColor: "#f5f9ff",
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  outputTabActive: {
    borderColor: "#0f766e",
    backgroundColor: "#e6f4f2",
  },
  outputTabText: {
    color: "#2a4c68",
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
  },
  outputTabTextActive: {
    color: "#0f766e",
    fontFamily: "Manrope_700Bold",
  },
  outputPanel: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d7e5f1",
    backgroundColor: "#f8fbff",
    padding: 10,
    gap: 4,
  },
  fieldWrap: {
    gap: 4,
  },
  label: {
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
    color: "#17344d",
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#c8d7e6",
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
    color: "#12324e",
    fontFamily: "Manrope_400Regular",
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 92,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  actionButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    paddingHorizontal: 8,
  },
  actionPrimary: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e",
  },
  actionSecondary: {
    backgroundColor: "#f4f8fc",
    borderColor: "#b3c6d9",
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
    color: "#183853",
    fontFamily: "Manrope_400Regular",
    fontSize: 14,
    lineHeight: 20,
  },
  metaText: {
    color: "#4d657d",
    fontFamily: "Manrope_400Regular",
    fontSize: 12,
    lineHeight: 17,
  },
  sectionTitle: {
    marginTop: 8,
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
    borderColor: "#c5d7e9",
    backgroundColor: "#f2f7fc",
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
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
    borderColor: "#d5e0eb",
    backgroundColor: "#f8fbfe",
    borderRadius: 12,
    padding: 10,
    gap: 4,
    borderLeftWidth: 4,
    borderLeftColor: "#0f766e",
  },
  postKitCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#cfe0ee",
    backgroundColor: "#ffffff",
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
    backgroundColor: "rgba(9, 21, 35, 0.42)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d3e1ee",
    padding: 16,
    alignItems: "center",
    gap: 8,
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
});
