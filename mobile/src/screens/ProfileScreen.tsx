import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { UserSession } from './DashboardScreen';
import {
  requestPasswordResetOtp,
  verifyOtpAndResetPassword,
  updateUserProfile,
} from '../services/db';

interface ProfileScreenProps {
  user: UserSession;
  onBack: () => void;
  onLogout: () => void;
  onUserUpdated?: (updated: UserSession) => void;
}

export default function ProfileScreen({
  user,
  onBack,
  onLogout,
  onUserUpdated,
}: ProfileScreenProps) {
  const [currentUser, setCurrentUser] = useState<UserSession>(user);

  // Edit Name Modal State
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [newName, setNewName] = useState(user.fullName || user.username || '');
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  // Reset Password Modal State
  const [showResetModal, setShowResetModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isResettingPw, setIsResettingPw] = useState(false);
  const [generatedOtpHint, setGeneratedOtpHint] = useState<string | null>(null);

  // Role Badge Styling
  const getRoleStyle = (role?: string) => {
    switch (role) {
      case 'SUPERVISOR':
        return { label: 'Supervisor', color: '#A78BFA', bg: 'rgba(139, 92, 246, 0.18)', border: '#8B5CF6' };
      case 'INVENTORY_ADMIN':
        return { label: 'Inventory Admin', color: '#34D399', bg: 'rgba(16, 185, 129, 0.18)', border: '#10B981' };
      case 'SYSTEM_ADMIN':
        return { label: 'System Admin', color: '#FBBF24', bg: 'rgba(245, 158, 11, 0.18)', border: '#F59E0B' };
      default:
        return { label: 'Warehouse Operator', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.18)', border: '#0284C7' };
    }
  };

  const roleStyle = getRoleStyle(currentUser.role);
  const displayName = currentUser.fullName || currentUser.username || currentUser.email.split('@')[0];
  const userInitials = displayName
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join('') || 'ST';

  // 1. Handle Update Profile Name
  const handleSaveName = async () => {
    const clean = newName.trim();
    if (!clean) {
      Alert.alert('Validation Error', 'Name cannot be empty.');
      return;
    }

    setIsUpdatingName(true);
    try {
      const res = await updateUserProfile({
        email: currentUser.email,
        fullName: clean,
        username: clean,
      });

      if (!res.success || !res.user) {
        Alert.alert('Update Notice', res.error || 'Failed to update name.');
        return;
      }

      setCurrentUser(res.user);
      if (onUserUpdated) onUserUpdated(res.user);
      setShowEditNameModal(false);
      Alert.alert('Success', 'Profile name updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not update profile name.');
    } finally {
      setIsUpdatingName(false);
    }
  };

  // 2. Handle Request OTP
  const handleTriggerOtp = async () => {
    setIsSendingOtp(true);
    setGeneratedOtpHint(null);
    try {
      const res = await requestPasswordResetOtp(currentUser.email);
      if (res.success && res.otp) {
        setGeneratedOtpHint(res.otp);
        setShowResetModal(true);
        Alert.alert(
          'Verification Code Sent',
          `A 6-digit OTP has been issued for ${currentUser.email}.\n\nOTP Code: ${res.otp}\n(Valid for 10 minutes)`
        );
      } else {
        Alert.alert('OTP Notice', res.error || 'Failed to generate OTP code.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not send verification OTP.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // 3. Handle Verify OTP and Reset Password
  const handleVerifyAndResetPassword = async () => {
    if (!otpCode.trim()) {
      Alert.alert('Missing Field', 'Please enter the 6-digit OTP verification code.');
      return;
    }
    if (newPassword.trim().length < 6) {
      Alert.alert('Password Too Short', 'Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Password Mismatch', 'New Password and Confirm Password do not match.');
      return;
    }

    setIsResettingPw(true);
    try {
      const res = await verifyOtpAndResetPassword({
        email: currentUser.email,
        otp: otpCode.trim(),
        newPassword: newPassword.trim(),
      });

      if (!res.success) {
        Alert.alert('Verification Failed', res.error || 'Invalid OTP code.');
        return;
      }

      setShowResetModal(false);
      setOtpCode('');
      setNewPassword('');
      setConfirmPassword('');
      setGeneratedOtpHint(null);

      Alert.alert(
        'Password Updated Successfully',
        'Your password has been securely reset in PostgreSQL database. Your new credentials are now active!'
      );
    } catch (pwErr: any) {
      Alert.alert('Error', pwErr?.message || 'Could not reset password.');
    } finally {
      setIsResettingPw(false);
    }
  };

  // 4. Confirm Logout
  const handleConfirmLogout = () => {
    Alert.alert(
      'Sign Out Confirmation',
      `Are you sure you want to log out of ${currentUser.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: onLogout,
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Top Navigation Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={styles.navTitleGroup}>
          <Text style={styles.navTitle}>Staff Account Profile</Text>
          <Text style={styles.navSubtitle}>CongioTech Pharma ID & Access Control</Text>
        </View>
        <View style={styles.sessionStatusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Active</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Hero Header Card */}
        <View style={styles.heroCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>{userInitials}</Text>
            </View>
            <TouchableOpacity
              style={styles.avatarEditBadge}
              onPress={() => setShowEditNameModal(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="pencil" size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.heroInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.heroName}>{displayName}</Text>
              <TouchableOpacity onPress={() => setShowEditNameModal(true)} style={styles.inlineEditBtn}>
                <Ionicons name="create-outline" size={18} color="#38BDF8" />
              </TouchableOpacity>
            </View>

            {/* Email Address (Mail ID) */}
            <View style={styles.emailPill}>
              <Ionicons name="mail" size={14} color="#38BDF8" style={{ marginRight: 6 }} />
              <Text style={styles.emailText}>{currentUser.email}</Text>
              <Ionicons name="checkmark-circle" size={14} color="#10B981" style={{ marginLeft: 6 }} />
            </View>

            {/* Role Badge */}
            <View
              style={[
                styles.roleBadgePill,
                { backgroundColor: roleStyle.bg, borderColor: roleStyle.border },
              ]}
            >
              <Ionicons name="shield-checkmark" size={13} color={roleStyle.color} style={{ marginRight: 5 }} />
              <Text style={[styles.roleBadgePillText, { color: roleStyle.color }]}>
                {roleStyle.label}
              </Text>
            </View>
          </View>
        </View>

        {/* Section 1: Staff Identity & Details */}
        <Text style={styles.sectionHeader}>Staff Identification & Workstation</Text>
        <View style={styles.infoCard}>
          {/* Item 1: Full Name */}
          <View style={styles.infoRow}>
            <View style={styles.infoIconWrapper}>
              <Ionicons name="person-outline" size={18} color="#38BDF8" />
            </View>
            <View style={styles.infoTextCol}>
              <Text style={styles.infoLabel}>Full Name</Text>
              <Text style={styles.infoValue}>{displayName}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowEditNameModal(true)}>
              <Text style={styles.changeActionText}>Edit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Item 2: Mail ID (Email Address) */}
          <View style={styles.infoRow}>
            <View style={styles.infoIconWrapper}>
              <Ionicons name="mail-outline" size={18} color="#38BDF8" />
            </View>
            <View style={styles.infoTextCol}>
              <Text style={styles.infoLabel}>Mail ID</Text>
              <Text style={styles.infoValue}>{currentUser.email}</Text>
            </View>
            <View style={styles.verifiedTag}>
              <Text style={styles.verifiedTagText}>Verified</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Item 3: Username */}
          <View style={styles.infoRow}>
            <View style={styles.infoIconWrapper}>
              <Ionicons name="at-outline" size={18} color="#38BDF8" />
            </View>
            <View style={styles.infoTextCol}>
              <Text style={styles.infoLabel}>Username</Text>
              <Text style={styles.infoValue}>{currentUser.username || currentUser.email.split('@')[0]}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Item 5: Assigned Facility */}
          <View style={styles.infoRow}>
            <View style={styles.infoIconWrapper}>
              <Ionicons name="business-outline" size={18} color="#38BDF8" />
            </View>
            <View style={styles.infoTextCol}>
              <Text style={styles.infoLabel}>Assigned Facility</Text>
              <Text style={styles.infoValue}>Central Pharmaceutical Depot - Bay 01</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Item 6: Work Shift */}
          <View style={styles.infoRow}>
            <View style={styles.infoIconWrapper}>
              <Ionicons name="time-outline" size={18} color="#38BDF8" />
            </View>
            <View style={styles.infoTextCol}>
              <Text style={styles.infoLabel}>Assigned Shift</Text>
              <Text style={styles.infoValue}>General Operations (08:00 - 17:00 IST)</Text>
            </View>
          </View>
        </View>

        {/* Section 2: Security & Reset Password with OTP */}
        <Text style={styles.sectionHeader}>Security & Credentials</Text>
        <View style={styles.securityCard}>
          <View style={styles.securityHeaderRow}>
            <View style={styles.securityIconBox}>
              <Ionicons name="lock-closed" size={20} color="#F59E0B" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.securityTitle}>Account Authentication</Text>
              <Text style={styles.securitySubtitle}>
                Protected by 2-Factor OTP verification & GxP-compliant audit trail.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.resetPasswordBtn}
            onPress={handleTriggerOtp}
            activeOpacity={0.85}
            disabled={isSendingOtp}
          >
            {isSendingOtp ? (
              <ActivityIndicator color="#0F172A" size="small" />
            ) : (
              <>
                <Ionicons name="key-outline" size={18} color="#0F172A" style={{ marginRight: 8 }} />
                <Text style={styles.resetPasswordBtnText}>Reset Password (OTP Verification)</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Section 4: Sign Out Button */}
        <TouchableOpacity
          style={styles.logoutButtonLarge}
          onPress={handleConfirmLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color="#F43F5E" style={{ marginRight: 8 }} />
          <Text style={styles.logoutButtonLargeText}>Sign Out of Device</Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          CongioTech Pharma Systems • Confidential & Regulated Healthcare Environment
        </Text>
      </ScrollView>

      {/* ------------------------------------------------------------- */}
      {/* Modal 1: Edit Name Modal */}
      {/* ------------------------------------------------------------- */}
      <Modal visible={showEditNameModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Edit Staff Name</Text>
              <TouchableOpacity onPress={() => setShowEditNameModal(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubLabel}>Enter your full name for inventory audit records:</Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Dr. Rajesh Kumar"
              placeholderTextColor="#64748B"
              autoFocus
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowEditNameModal(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveName}
                disabled={isUpdatingName}
              >
                {isUpdatingName ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>Save Name</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* Modal 2: Reset Password with OTP Verification Modal */}
      {/* ------------------------------------------------------------- */}
      <Modal visible={showResetModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBoxLarge}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.keyIconCircle}>
                  <Ionicons name="key" size={16} color="#38BDF8" />
                </View>
                <Text style={styles.modalTitle}>Reset Account Password</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowResetModal(false);
                  setOtpCode('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubLabel}>
              Enter the 6-digit verification OTP sent to{' '}
              <Text style={{ color: '#38BDF8', fontWeight: '600' }}>{currentUser.email}</Text>:
            </Text>

            {/* OTP Hint Banner */}
            {generatedOtpHint && (
              <View style={styles.otpBanner}>
                <Ionicons name="shield-checkmark" size={16} color="#10B981" style={{ marginRight: 6 }} />
                <Text style={styles.otpBannerText}>
                  Active Verification OTP: <Text style={styles.otpBannerCode}>{generatedOtpHint}</Text>
                </Text>
                <TouchableOpacity
                  onPress={() => setOtpCode(generatedOtpHint)}
                  style={styles.autoFillBtn}
                >
                  <Text style={styles.autoFillBtnText}>Auto-fill</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* OTP Input */}
            <Text style={styles.inputFieldLabel}>6-Digit OTP Code</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={18} color="#64748B" style={{ marginLeft: 12 }} />
              <TextInput
                style={[styles.modalInputWithIcon, styles.otpTextInput]}
                value={otpCode}
                onChangeText={setOtpCode}
                placeholder="123456"
                placeholderTextColor="#64748B"
                keyboardType="number-pad"
                maxLength={6}
              />
              <TouchableOpacity onPress={handleTriggerOtp} style={{ paddingHorizontal: 10 }}>
                <Text style={styles.resendText}>Resend</Text>
              </TouchableOpacity>
            </View>

            {/* New Password Input */}
            <Text style={styles.inputFieldLabel}>New Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="key-outline" size={18} color="#64748B" style={{ marginLeft: 12 }} />
              <TextInput
                style={styles.modalInputWithIcon}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Minimum 6 characters"
                placeholderTextColor="#64748B"
                secureTextEntry={!showNewPw}
              />
              <TouchableOpacity onPress={() => setShowNewPw(!showNewPw)} style={{ paddingHorizontal: 12 }}>
                <Ionicons name={showNewPw ? 'eye-off-outline' : 'eye-outline'} size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Confirm Password Input */}
            <Text style={styles.inputFieldLabel}>Confirm New Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#64748B" style={{ marginLeft: 12 }} />
              <TextInput
                style={styles.modalInputWithIcon}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter new password"
                placeholderTextColor="#64748B"
                secureTextEntry={!showConfirmPw}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPw(!showConfirmPw)}
                style={{ paddingHorizontal: 12 }}
              >
                <Ionicons name={showConfirmPw ? 'eye-off-outline' : 'eye-outline'} size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Buttons */}
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowResetModal(false);
                  setOtpCode('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleVerifyAndResetPassword}
                disabled={isResettingPw}
              >
                {isResettingPw ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>Verify OTP & Update</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  navTitleGroup: {
    flex: 1,
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  navSubtitle: {
    fontSize: 11,
    color: '#38BDF8',
    marginTop: 1,
  },
  sessionStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatarCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#0284C7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#38BDF8',
  },
  avatarInitials: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#38BDF8',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1E293B',
  },
  heroInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroName: {
    fontSize: 19,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  inlineEditBtn: {
    marginLeft: 6,
    padding: 4,
  },
  emailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  emailText: {
    fontSize: 13,
    color: '#CBD5E1',
    fontWeight: '500',
  },
  roleBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  roleBadgePillText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 6,
    marginLeft: 4,
  },
  infoCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  infoTextCol: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F1F5F9',
    marginTop: 2,
  },
  changeActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#38BDF8',
  },
  verifiedTag: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  verifiedTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    opacity: 0.6,
  },
  securityCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  securityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  securityIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  securityTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  securitySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
    lineHeight: 16,
  },
  resetPasswordBtn: {
    backgroundColor: '#38BDF8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
  },
  resetPasswordBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  logoutButtonLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 8,
    marginBottom: 16,
  },
  logoutButtonLargeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F43F5E',
  },
  footerNote: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalBox: {
    backgroundColor: '#1E293B',
    width: '100%',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalBoxLarge: {
    backgroundColor: '#1E293B',
    width: '100%',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#334155',
    maxHeight: '90%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  keyIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  modalSubLabel: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 14,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F8FAFC',
    fontSize: 15,
    marginBottom: 18,
  },
  inputFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 6,
    marginTop: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    marginBottom: 6,
  },
  modalInputWithIcon: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#F8FAFC',
    fontSize: 14,
  },
  otpTextInput: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 4,
  },
  resendText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
  },
  otpBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  otpBannerText: {
    fontSize: 12,
    color: '#E2E8F0',
    flex: 1,
  },
  otpBannerCode: {
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 1,
  },
  autoFillBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  autoFillBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalCancelBtnText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 14,
  },
  modalSaveBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSaveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
