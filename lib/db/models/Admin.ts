import mongoose, { Schema, Document } from "mongoose";

export interface IAdmin extends Document {
  username: string;
  passwordHash: string;
  email?: string;
  isActive: boolean;
  lastLogin?: Date;
  loginAttempts: number;
  lockUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Virtual properties
  isLocked?: boolean;
  // Methods
  incLoginAttempts(): Promise<any>;
  resetLoginAttempts(): Promise<any>;
}

const adminSchema = new Schema<IAdmin>(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      lowercase: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [50, "Username cannot exceed 50 characters"],
    },
    passwordHash: {
      type: String,
      required: [true, "Password hash is required"],
      select: false, // Don't include in queries by default
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      validate: {
        validator: (email: string) =>
          !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        message: "Invalid email format",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    loginAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lockUntil: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
adminSchema.index({ username: 1 }, { unique: true });
adminSchema.index({ isActive: 1 });
adminSchema.index({ lockUntil: 1 });

// Virtual property to check if account is locked
adminSchema.virtual("isLocked").get(function (this: IAdmin) {
  return !!(this.lockUntil && this.lockUntil > new Date());
});

// Method to increment login attempts
adminSchema.methods.incLoginAttempts = async function (this: IAdmin) {
  // If lock has expired, reset attempts
  if (this.lockUntil && this.lockUntil < new Date()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }

  const updates: any = { $inc: { loginAttempts: 1 } };

  // Lock account after 5 failed attempts for 15 minutes
  const maxAttempts = 5;
  const lockTime = 15 * 60 * 1000; // 15 minutes

  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = { lockUntil: new Date(Date.now() + lockTime) };
  }

  return this.updateOne(updates);
};

// Method to reset login attempts
adminSchema.methods.resetLoginAttempts = async function (this: IAdmin) {
  return this.updateOne({
    $set: { loginAttempts: 0, lastLogin: new Date() },
    $unset: { lockUntil: 1 },
  });
};

// Development hot-reload cleanup
if (process.env.NODE_ENV === "development") {
  const models = mongoose.models as { [key: string]: any };
  if (models.Admin) {
    delete models.Admin;
  }
  const connectionModels = mongoose.connection.models as { [key: string]: any };
  if (connectionModels.Admin) {
    delete connectionModels.Admin;
  }
}

export const Admin =
  mongoose.models.Admin || mongoose.model<IAdmin>("Admin", adminSchema);
