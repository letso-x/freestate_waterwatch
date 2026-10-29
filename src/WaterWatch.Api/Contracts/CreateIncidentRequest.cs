using System.ComponentModel.DataAnnotations;

namespace WaterWatch.Api.Contracts;

public sealed class CreateIncidentRequest : IValidatableObject
{
    [Required, StringLength(150, MinimumLength = 3)]
    public string Title { get; init; } = string.Empty;
    [Required, StringLength(2000, MinimumLength = 10)]
    public string Description { get; init; } = string.Empty;
    [Required, StringLength(300, MinimumLength = 3)]
    public string Location { get; init; } = string.Empty;
    [Range(-90d, 90d)]
    public double? Latitude { get; init; }
    [Range(-180d, 180d)]
    public double? Longitude { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Latitude.HasValue != Longitude.HasValue)
            yield return new ValidationResult("Supply both latitude and longitude, or neither.", [nameof(Latitude), nameof(Longitude)]);
        if ((Title?.Trim().Length ?? 0) < 3)
            yield return new ValidationResult("Title must contain at least 3 non-padding characters.", [nameof(Title)]);
        if ((Description?.Trim().Length ?? 0) < 10)
            yield return new ValidationResult("Description must contain at least 10 non-padding characters.", [nameof(Description)]);
        if ((Location?.Trim().Length ?? 0) < 3)
            yield return new ValidationResult("Location must contain at least 3 non-padding characters.", [nameof(Location)]);
    }
}
